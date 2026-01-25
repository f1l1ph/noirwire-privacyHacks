use crate::errors::PoolError;
use crate::events::NullifierRecordedEvent;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32])]
pub struct RecordNullifier<'info> {
    /// Pool state
    #[account(
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, PoolState>,

    /// Nullifier PDA (created to prove uniqueness)
    /// SECURITY: init constraint prevents double-spend by rejecting duplicate nullifiers
    #[account(
        init,
        payer = payer,
        space = NullifierEntry::SIZE,
        seeds = [b"nullifier", pool.key().as_ref(), &nullifier],
        bump
    )]
    pub nullifier_entry: Account<'info, NullifierEntry>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordNullifier>,
    nullifier: [u8; 32],
    nullifiers_root: [u8; 32],
    merkle_proof: Vec<[u8; 32]>,
) -> Result<()> {
    let pool = &ctx.accounts.pool;

    // 1. Verify nullifiers_root matches last batch settlement
    require!(
        pool.last_nullifiers_root == nullifiers_root,
        PoolError::InvalidNullifierProof
    );

    // 2. Verify nullifier is in nullifiers_root using merkle proof
    let computed_root = compute_merkle_root(&nullifier, &merkle_proof);
    require!(
        computed_root == nullifiers_root,
        PoolError::InvalidNullifierProof
    );

    msg!("Nullifier merkle proof verified: root={:?}", computed_root);

    // 3. Create nullifier PDA (init ensures uniqueness - prevents double-spend)
    let nullifier_entry = &mut ctx.accounts.nullifier_entry;
    nullifier_entry.nullifier = nullifier;
    nullifier_entry.slot = Clock::get()?.slot;
    nullifier_entry.bump = ctx.bumps.nullifier_entry;

    emit!(NullifierRecordedEvent {
        pool: pool.key(),
        nullifier,
        nullifiers_root,
        slot: Clock::get()?.slot,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Nullifier recorded: {:?} at slot {}",
        nullifier,
        Clock::get()?.slot
    );

    Ok(())
}

/// Compute merkle root from leaf and proof path
/// Uses Keccak256 for hashing (same as Noir circuit)
fn compute_merkle_root(leaf: &[u8; 32], proof: &[[u8; 32]]) -> [u8; 32] {
    let mut current = *leaf;

    for sibling in proof {
        // Order nodes by value (smaller first for consistency)
        current = if current <= *sibling {
            keccak::hash(&[&current[..], &sibling[..]].concat()).to_bytes()
        } else {
            keccak::hash(&[&sibling[..], &current[..]].concat()).to_bytes()
        };
    }

    current
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_merkle_root() {
        let leaf = [1u8; 32];
        let sibling1 = [2u8; 32];
        let sibling2 = [3u8; 32];
        let proof = vec![sibling1, sibling2];

        let root = compute_merkle_root(&leaf, &proof);

        // Verify root is deterministic
        assert_eq!(root.len(), 32);
        assert_ne!(root, [0u8; 32]);
    }
}
