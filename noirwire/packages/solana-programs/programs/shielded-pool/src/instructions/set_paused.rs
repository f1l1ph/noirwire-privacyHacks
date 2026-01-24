use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::PoolError;
use crate::events::EmergencyPauseEvent;

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
