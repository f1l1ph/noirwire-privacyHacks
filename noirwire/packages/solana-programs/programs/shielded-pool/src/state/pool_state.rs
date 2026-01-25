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

#[account]
#[derive(InitSpace)]
pub struct PoolState {
    /// Authority that can upgrade the pool (multisig recommended)
    pub authority: Pubkey,

    /// PER (Private Ephemeral Rollup) authority authorized to call settle_batch
    /// SECURITY: Only this address can submit batch settlements (CRITICAL-05)
    pub per_authority: Pubkey,

    /// Current merkle root of all commitments
    pub commitment_root: [u8; 32],

    /// Historical roots (for delayed spending - keeps last N roots valid)
    /// Ring buffer of size 32 for ~13 second spending window
    pub historical_roots: [[u8; 32]; 32],
    pub roots_index: u8,

    /// Total shielded balance (for accounting, public info)
    pub total_shielded: u64,

    /// Supported token mint
    pub token_mint: Pubkey,

    /// Pool's token vault (holds all shielded tokens)
    pub token_vault: Pubkey,

    /// Verification key hash (ensures correct circuit)
    pub vk_hash: [u8; 32],

    /// Pause flag for emergencies
    pub paused: bool,

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

impl PoolState {
    /// Check if a root is valid (current or in history)
    pub fn is_valid_root(&self, root: &[u8; 32]) -> bool {
        if self.commitment_root == *root {
            return true;
        }
        self.historical_roots.iter().any(|r| r == root)
    }

    /// Update root (push current to history)
    ///
    /// SECURITY: Clears the next slot to prevent accepting very old roots after wraparound
    /// See: Security Audit MEDIUM-01
    pub fn update_root(&mut self, new_root: [u8; 32]) {
        // Store current root in history
        self.historical_roots[self.roots_index as usize] = self.commitment_root;

        // Calculate next index
        let next_index = (self.roots_index + 1) % (HISTORICAL_ROOTS_SIZE as u8);

        // Clear slot about to be overwritten (mark as invalid)
        // This ensures wraparound doesn't allow very old roots
        self.historical_roots[next_index as usize] = [0u8; 32];

        self.roots_index = next_index;
        self.commitment_root = new_root;
    }
}
