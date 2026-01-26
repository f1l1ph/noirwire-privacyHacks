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
/// - Account size is ~36KB (uses zero-copy deserialization)
pub fn handler(ctx: Context<InitializeHistoricalRoots>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let mut historical_roots = ctx.accounts.historical_roots.load_init()?;

    // Initialize the historical roots account
    historical_roots.init(pool.key());

    msg!(
        "Historical roots PDA initialized for pool: {:?}",
        pool.key()
    );
    msg!("Capacity: 900 roots (~6 minute spending window)");

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

    /// The historical roots PDA to create (zero-copy for large account)
    #[account(
        init,
        payer = authority,
        space = HistoricalRoots::SPACE,
        seeds = [HISTORICAL_ROOTS_SEED, pool.key().as_ref()],
        bump
    )]
    pub historical_roots: AccountLoader<'info, HistoricalRoots>,

    /// Pool authority (must match pool.authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
