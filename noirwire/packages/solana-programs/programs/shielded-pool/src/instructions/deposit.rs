use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::PoolError;
use crate::events::DepositEvent;

#[derive(Accounts)]
#[instruction(amount: u64, commitment: [u8; 32])]
pub struct Deposit<'info> {
    /// Pool state account
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.paused @ PoolError::PoolPaused
    )]
    pub pool: Account<'info, PoolState>,

    /// User's token account (source)
    #[account(
        mut,
        constraint = user_token_account.mint == pool.token_mint @ PoolError::InvalidMint
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Pool's token vault (destination)
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// Depositor (signer)
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<Deposit>,
    amount: u64,
    commitment: [u8; 32],
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // TODO: Verify ZK proof that commitment is valid
    // For now, just accept the commitment

    // Transfer tokens from user to pool vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Update pool state
    // TODO: Update merkle tree with commitment
    let new_root = commitment; // Placeholder - should compute new merkle root
    pool.update_root(new_root);
    pool.total_shielded = pool.total_shielded.checked_add(amount)
        .ok_or(PoolError::Overflow)?;
    pool.total_deposits += 1;

    // Emit event
    emit!(DepositEvent {
        pool: pool.key(),
        commitment,
        amount,
        new_root,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Deposit successful: {} tokens", amount);
    Ok(())
}
