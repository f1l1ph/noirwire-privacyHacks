use anchor_lang::prelude::*;

/// Configuration: Historical roots ring buffer size
///
/// DESIGN DECISION (Security Audit 2026-01-25):
/// - 32 roots × 0.4s = ~13 seconds spending window
/// - Trade-off: 32 × 32 bytes = 1 KB (fits within Solana account limits)
/// - This is a minimal viable window for testing
///
/// PRODUCTION TODO: Implement separate PDA for full 900-slot buffer
/// - 900 roots × 0.4s = 6 minutes spending window (blueprint specification)
/// - Requires separate HistoricalRoots PDA account
///
/// See: Security Audit Report CRITICAL-02
pub const HISTORICAL_ROOTS_SIZE: usize = 32;

/// Merkle tree depth - MUST match circuit TREE_DEPTH (24 levels = ~16M leaves)
pub const TREE_DEPTH: usize = 24;

/// Maximum age of a merkle root for withdrawal proofs (in slots)
///
/// SECURITY (HIGH-01): Root Expiration Enforcement
/// - 900 slots × 0.4s per slot = 360 seconds = 6 minutes spending window
/// - Proofs referencing roots older than this are rejected
/// - Prevents stale state attacks and indefinite proof validity
///
/// See: Security Audit 2026-01-26 HIGH-01, Blueprint 10_Solana_Programs.md
pub const MAX_ROOT_AGE_SLOTS: u64 = 900;

/// Minimum deposit amount in lamports (0.001 SOL)
///
/// SECURITY (MEDIUM-04): Spam protection
/// - Prevents attackers from bloating merkle tree with dust deposits
/// - Also helps with compute unit exhaustion attacks
pub const MIN_DEPOSIT_LAMPORTS: u64 = 1_000_000;

/// Minimum deposit amount for SPL tokens (1000 units with 6 decimals = 0.001)
///
/// For tokens with different decimals, this should be adjusted
pub const MIN_DEPOSIT_SPL_UNITS: u64 = 1_000;

#[account]
#[derive(InitSpace)]
pub struct PoolState {
    /// Account structure version for migration support
    /// SECURITY (LOW-03): Versioning for future-proof upgrades
    pub version: u8,

    /// Authority that can upgrade the pool (multisig recommended)
    pub authority: Pubkey,

    /// PER (Private Ephemeral Rollup) authority authorized to call settle_batch
    /// SECURITY: Only this address can submit batch settlements (CRITICAL-05)
    pub per_authority: Pubkey,

    /// Current merkle root of all commitments
    pub commitment_root: [u8; 32],

    /// Slot when the current root was set
    /// SECURITY (HIGH-01): Used for root expiration enforcement
    pub commitment_root_slot: u64,

    /// Historical roots (for delayed spending - keeps last N roots valid)
    /// Ring buffer of size 32 for ~13 second spending window
    pub historical_roots: [[u8; 32]; 32],

    /// Slots when each historical root was added
    /// SECURITY (HIGH-01): Tracks root age for expiration
    pub historical_roots_slots: [u64; 32],

    pub roots_index: u8,

    /// Total shielded balance (for accounting, public info)
    pub total_shielded: u64,

    /// Supported token mint
    pub token_mint: Pubkey,

    /// Pool's token vault (holds all shielded tokens)
    pub token_vault: Pubkey,

    /// Verification key hash (ensures correct circuit)
    /// SECURITY (HIGH-02): Must match loaded VK at verification time
    pub vk_hash: [u8; 32],

    /// Pause flag for emergencies
    pub paused: bool,

    /// Emergency mode - allows emergency withdrawals when true
    /// SECURITY (LOW-01): Emergency withdrawal mechanism
    pub emergency_mode: bool,

    /// Stats
    pub total_deposits: u64,
    pub total_withdrawals: u64,
    pub total_nullifiers: u64,

    /// Last nullifiers root for batch verification
    pub last_nullifiers_root: [u8; 32],

    /// Bump seed for PDA
    pub bump: u8,

    /// Reserved for future upgrades
    #[max_len(64)]
    pub _reserved: Vec<u8>,
}

/// Current account version
pub const POOL_STATE_VERSION: u8 = 2;

impl PoolState {
    /// Check if a root is valid (current or in history) - DEPRECATED
    ///
    /// WARNING: This method does NOT enforce root expiration.
    /// Use `is_valid_root_with_expiration` for production code.
    /// Kept for backwards compatibility with tests.
    #[deprecated(
        note = "Use is_valid_root_with_expiration for production - this doesn't enforce expiration"
    )]
    pub fn is_valid_root(&self, root: &[u8; 32]) -> bool {
        if self.commitment_root == *root {
            return true;
        }
        self.historical_roots.iter().any(|r| r == root)
    }

    /// Check if a root is valid with expiration enforcement
    ///
    /// SECURITY (HIGH-01): Root Expiration Enforcement
    /// - Checks if root exists in current or historical roots
    /// - Enforces MAX_ROOT_AGE_SLOTS expiration
    /// - Returns false for expired roots even if they exist in history
    ///
    /// # Arguments
    /// * `root` - The merkle root to validate
    /// * `current_slot` - Current blockchain slot
    ///
    /// # Returns
    /// * `true` if root is valid AND not expired
    /// * `false` if root doesn't exist OR is expired
    pub fn is_valid_root_with_expiration(&self, root: &[u8; 32], current_slot: u64) -> bool {
        // Check current root first (most common case)
        if self.commitment_root == *root {
            // Verify current root is not too old
            return current_slot.saturating_sub(self.commitment_root_slot) <= MAX_ROOT_AGE_SLOTS;
        }

        // Search historical roots with expiration check
        for (i, hist_root) in self.historical_roots.iter().enumerate() {
            if hist_root == root {
                // Found the root, check if it's expired
                let root_slot = self.historical_roots_slots[i];

                // Zero slot means uninitialized (invalid)
                if root_slot == 0 {
                    return false;
                }

                // Check expiration
                return current_slot.saturating_sub(root_slot) <= MAX_ROOT_AGE_SLOTS;
            }
        }

        false
    }

    /// Update root (push current to history) with slot tracking
    ///
    /// SECURITY:
    /// - Clears the next slot to prevent accepting very old roots after wraparound
    /// - Tracks slot for each root for expiration enforcement (HIGH-01)
    /// See: Security Audit MEDIUM-01, HIGH-01
    pub fn update_root(&mut self, new_root: [u8; 32], current_slot: u64) {
        // Store current root in history with its slot
        self.historical_roots[self.roots_index as usize] = self.commitment_root;
        self.historical_roots_slots[self.roots_index as usize] = self.commitment_root_slot;

        // Calculate next index
        let next_index = (self.roots_index + 1) % (HISTORICAL_ROOTS_SIZE as u8);

        // Clear slot about to be overwritten (mark as invalid)
        // This ensures wraparound doesn't allow very old roots
        self.historical_roots[next_index as usize] = [0u8; 32];
        self.historical_roots_slots[next_index as usize] = 0;

        self.roots_index = next_index;
        self.commitment_root = new_root;
        self.commitment_root_slot = current_slot;
    }

    /// Check if pool allows emergency withdrawals
    ///
    /// SECURITY (LOW-01): Emergency withdrawal mechanism
    pub fn allows_emergency_withdrawal(&self) -> bool {
        self.emergency_mode
    }
}
