use anchor_lang::prelude::*;

/// Individual nullifier entry (PDA per nullifier)
#[account]
pub struct NullifierEntry {
    /// The nullifier hash
    pub nullifier: [u8; 32],

    /// Block when this nullifier was added (for analytics)
    pub slot: u64,

    /// Bump seed
    pub bump: u8,
}

impl NullifierEntry {
    pub const SIZE: usize = 8 + 32 + 8 + 1;

    /// PDA seeds: ["nullifier", pool_pubkey, nullifier_hash]
    pub fn seeds<'a>(pool: &'a Pubkey, nullifier: &'a [u8; 32]) -> [&'a [u8]; 3] {
        [b"nullifier", pool.as_ref(), nullifier]
    }
}

/// Batch nullifier submission (for PER settlement)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct NullifierBatch {
    pub nullifiers: Vec<[u8; 32]>,
}
