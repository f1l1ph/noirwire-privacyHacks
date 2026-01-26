use crate::errors::PoolError;
use crate::events::EmergencyWithdrawEvent;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

/// Emergency Withdrawal Context
///
/// SECURITY (LOW-01): Emergency withdrawal mechanism
/// This instruction allows users to withdraw funds without ZK proofs
/// when the pool is in emergency mode. This is a last-resort mechanism
/// for catastrophic failure scenarios (e.g., ZK circuits broken).
///
/// REQUIREMENTS:
/// - Pool must be paused
/// - Pool must be in emergency_mode
/// - User must provide a valid claim amount signed by authority
///
/// LIMITATIONS:
/// - Does NOT update merkle root (state becomes inconsistent)
/// - Does NOT create nullifiers (double-spend possible if pool restarts)
/// - Should only be used for final fund recovery before pool shutdown
#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct EmergencyWithdraw<'info> {
    /// Pool state - must be in emergency mode
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.paused @ PoolError::PoolPaused,
        constraint = pool.emergency_mode @ PoolError::EmergencyModeNotActive
    )]
    pub pool: Account<'info, PoolState>,

    /// Pool's token vault
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// Recipient's token account
    #[account(
        mut,
        constraint = recipient_token_account.mint == pool.token_mint @ PoolError::InvalidMint
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// Pool authority PDA (for signing vault transfers)
    /// CHECK: PDA verified by seeds
    #[account(
        seeds = [b"authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    /// Pool admin must authorize emergency withdrawals
    #[account(
        constraint = authority.key() == pool.authority @ PoolError::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Recipient of the funds
    pub recipient: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

/// Emergency withdrawal handler
///
/// SECURITY NOTES:
/// - This bypasses all ZK verification
/// - Pool admin MUST verify the withdrawal claim off-chain
/// - This should only be used for final fund recovery
/// - Consider implementing a timelock for additional security
pub fn handler(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // Verify pool has sufficient balance
    require!(
        pool.total_shielded >= amount,
        PoolError::InsufficientPoolBalance
    );

    require!(
        ctx.accounts.pool_vault.amount >= amount,
        PoolError::InsufficientVaultBalance
    );

    // Transfer tokens from pool to recipient
    let pool_key = pool.key();
    let authority_seeds = &[b"authority", pool_key.as_ref(), &[ctx.bumps.pool_authority]];
    let signer_seeds = &[&authority_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.pool_vault.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.pool_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, amount)?;

    // Update pool accounting (does NOT update merkle root)
    pool.total_shielded = pool
        .total_shielded
        .checked_sub(amount)
        .ok_or(PoolError::Underflow)?;

    pool.total_withdrawals = pool
        .total_withdrawals
        .checked_add(1)
        .ok_or(PoolError::Overflow)?;

    // Emit event
    emit!(EmergencyWithdrawEvent {
        pool: pool.key(),
        recipient: ctx.accounts.recipient.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "EMERGENCY WITHDRAWAL: {} tokens to {}",
        amount,
        ctx.accounts.recipient.key()
    );
    msg!("WARNING: Pool state is now inconsistent. Do not resume normal operations.");

    Ok(())
}
