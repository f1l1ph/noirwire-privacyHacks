use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::PoolError;
use crate::events::BatchSettlementEvent;

#[derive(Accounts)]
#[instruction(new_root: [u8; 32], nullifiers_root: [u8; 32], nullifier_count: u32)]
pub struct SettleBatch<'info> {
    /// Pool state
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.paused @ PoolError::PoolPaused
    )]
    pub pool: Account<'info, PoolState>,

    /// PER authority (MagicBlock delegation)
    /// Only the delegated PER can call this
    pub per_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SettleBatch>,
    new_root: [u8; 32],
    nullifiers_root: [u8; 32],
    nullifier_count: u32,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // TODO: Verify batch ZK proof
    // The batch circuit proves:
    // - All nullifiers are valid (double-spend prevention)
    // - State transition from old_root to new_root is correct
    // - nullifiers_root is the merkle root of all batch nullifiers

    // Store nullifiers_root for verification
    // Individual nullifier PDAs are created by the indexer/PER in separate txs
    pool.last_nullifiers_root = nullifiers_root;
    pool.total_nullifiers += nullifier_count as u64;

    // Update pool state with new root
    let old_root = pool.commitment_root;
    pool.update_root(new_root);

    // Emit event with nullifiers_root (indexer will process individual nullifiers)
    emit!(BatchSettlementEvent {
        pool: pool.key(),
        old_root,
        new_root,
        nullifiers_root,
        nullifier_count,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Batch settlement: {} nullifiers", nullifier_count);
    Ok(())
}
