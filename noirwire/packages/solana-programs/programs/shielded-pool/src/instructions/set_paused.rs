use crate::errors::PoolError;
use crate::events::{EmergencyModeEvent, EmergencyPauseEvent};
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        has_one = authority @ PoolError::Unauthorized
    )]
    pub pool: Account<'info, PoolState>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.paused = paused;

    emit!(EmergencyPauseEvent {
        pool: pool.key(),
        paused,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Pool pause status: {}", paused);
    Ok(())
}

/// Emergency Mode Context
///
/// SECURITY (LOW-01): Emergency withdrawal mechanism
/// When enabled, allows users to recover funds without ZK proofs
/// This is a last-resort mechanism for catastrophic failure scenarios
#[derive(Accounts)]
pub struct SetEmergencyMode<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        has_one = authority @ PoolError::Unauthorized
    )]
    pub pool: Account<'info, PoolState>,

    pub authority: Signer<'info>,
}

/// Enable or disable emergency mode
///
/// SECURITY (LOW-01): Emergency withdrawal mechanism
/// - When enabled, `emergency_withdraw` instruction becomes available
/// - Should only be enabled if ZK circuits are broken or compromised
/// - Enables users to recover funds without proofs
/// - Pool must also be paused to prevent normal operations
pub fn set_emergency_mode_handler(
    ctx: Context<SetEmergencyMode>,
    emergency_mode: bool,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // Emergency mode can only be enabled when pool is paused
    if emergency_mode {
        require!(pool.paused, PoolError::PoolPaused);
    }

    pool.emergency_mode = emergency_mode;

    emit!(EmergencyModeEvent {
        pool: pool.key(),
        emergency_mode,
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Pool emergency mode: {}", emergency_mode);
    Ok(())
}
