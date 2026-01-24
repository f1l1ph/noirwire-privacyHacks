use anchor_lang::prelude::*;

/// Configuration: Historical roots ring buffer size
/// Absolute minimum to fit in Solana's 4KB stack limit
/// - 8 roots × 0.4s = 3.2 seconds spending window (PoC only!)
/// - Trade-off: 8 × 32 bytes = 256 bytes
///
/// ⚠️ WARNING: Production MUST use separate PDA for historical roots
pub const HISTORICAL_ROOTS_SIZE: usize = 8;

/// Merkle tree depth - MUST match circuit TREE_DEPTH (24 levels = ~16M leaves)
pub const TREE_DEPTH: usize = 24;

#[account]
pub struct PoolState {
    /// Authority that can upgrade the pool (multisig recommended)
    pub authority: Pubkey,

    /// Current merkle root of all commitments
    pub commitment_root: [u8; 32],

    /// Historical roots (for delayed spending - keeps last N roots valid)
    /// NOTE: Ring buffer size (32) is configurable via HISTORICAL_ROOTS_SIZE constant
    /// Increase for longer spending windows, decrease to save space
    pub historical_roots: [[u8; 32]; HISTORICAL_ROOTS_SIZE],
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
    pub _reserved: [u8; 256],
}

impl PoolState {
    pub const SIZE: usize = 8 +  // discriminator
        32 +                      // authority
        32 +                      // commitment_root
        (32 * HISTORICAL_ROOTS_SIZE) +  // historical_roots (configurable)
        1 +                       // roots_index
        8 +                       // total_shielded
        32 +                      // token_mint
        32 +                      // token_vault
        32 +                      // vk_hash
        1 +                       // paused
        8 + 8 + 8 +              // stats
        32 +                      // last_nullifiers_root
        1 +                       // bump
        256; // reserved

    /// Check if a root is valid (current or in history)
    pub fn is_valid_root(&self, root: &[u8; 32]) -> bool {
        if self.commitment_root == *root {
            return true;
        }
        self.historical_roots.iter().any(|r| r == root)
    }

    /// Update root (push current to history)
    pub fn update_root(&mut self, new_root: [u8; 32]) {
        self.historical_roots[self.roots_index as usize] = self.commitment_root;
        self.roots_index = (self.roots_index + 1) % (HISTORICAL_ROOTS_SIZE as u8);
        self.commitment_root = new_root;
    }
}

impl Default for PoolState {
    fn default() -> Self {
        Self {
            authority: Pubkey::default(),
            commitment_root: [0u8; 32],
            historical_roots: [[0u8; 32]; HISTORICAL_ROOTS_SIZE],
            roots_index: 0,
            total_shielded: 0,
            token_mint: Pubkey::default(),
            token_vault: Pubkey::default(),
            vk_hash: [0u8; 32],
            paused: false,
            total_deposits: 0,
            total_withdrawals: 0,
            total_nullifiers: 0,
            last_nullifiers_root: [0u8; 32],
            bump: 0,
            _reserved: [0u8; 256],
        }
    }
}
