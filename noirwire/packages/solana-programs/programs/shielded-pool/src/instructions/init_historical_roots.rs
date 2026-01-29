use crate::errors::PoolError;
use crate::state::{HistoricalRoots, PoolState, HISTORICAL_ROOTS_SEED};
use anchor_lang::prelude::*;

/// Initialize the Historical Roots PDA for production-scale merkle root storage
///
/// This creates a separate account that stores 900 historical merkle roots,
/// enabling a ~6 minute spending window as specified in the blueprints.
///
/// REQUIREMENTS:
/// - Pool must be initialized first
/// - Only the pool authority can call this
/// - Account size is ~40KB (uses borsh serialization for Vec support)
pub fn handler(ctx: Context<InitializeHistoricalRoots>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let historical_roots = &mut ctx.accounts.historical_roots;

    // Initialize the historical roots account with vectors
    historical_roots.init(pool.key());

    msg!(
        "Historical roots PDA initialized for pool: {:?}",
        pool.key()
    );
    msg!("Capacity: 900 roots (~6 minute spending window at 0.4s/slot)");

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeHistoricalRoots<'info> {
    /// The shielded pool this historical roots account belongs to
    #[account(
        mut,
        constraint = pool.authority == authority.key() @ PoolError::Unauthorized,
    )]
    pub pool: Account<'info, PoolState>,

    /// The historical roots PDA to create (uses borsh for vector support)
    #[account(
        init,
        payer = authority,
        space = HistoricalRoots::MAX_SPACE,
        seeds = [HISTORICAL_ROOTS_SEED, pool.key().as_ref()],
        bump
    )]
    pub historical_roots: Account<'info, HistoricalRoots>,

    /// Pool authority (must match pool.authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
