use crate::errors::PoolError;
use crate::events::WithdrawEvent;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
#[instruction(amount: u64, nullifier: [u8; 32])]
pub struct Withdraw<'info> {
    /// Pool state
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.paused @ PoolError::PoolPaused
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

    /// Nullifier PDA (created to mark as spent)
    #[account(
        init,
        payer = payer,
        space = NullifierEntry::SIZE,
        seeds = [b"nullifier", pool.key().as_ref(), &nullifier],
        bump
    )]
    pub nullifier_entry: Account<'info, NullifierEntry>,

    /// Payer for nullifier account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Pool authority PDA (for signing vault transfers)
    /// CHECK: PDA verified by seeds
    #[account(
        seeds = [b"authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Withdraw>,
    amount: u64,
    nullifier: [u8; 32],
    recipient: Pubkey,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // TODO: Verify ZK proof (nullifier, merkle proof, balance)
    // For now, assume proof is valid

    // Record nullifier (account creation proves uniqueness)
    let nullifier_entry = &mut ctx.accounts.nullifier_entry;
    nullifier_entry.nullifier = nullifier;
    nullifier_entry.slot = Clock::get()?.slot;
    nullifier_entry.bump = ctx.bumps.nullifier_entry;

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

    // Update pool state
    // TODO: Update merkle root with spent commitment
    let new_root = nullifier; // Placeholder
    pool.update_root(new_root);
    pool.total_shielded = pool
        .total_shielded
        .checked_sub(amount)
        .ok_or(PoolError::Underflow)?;
    pool.total_withdrawals += 1;
    pool.total_nullifiers += 1;

    // Emit event
    emit!(WithdrawEvent {
        pool: pool.key(),
        nullifier,
        amount,
        recipient,
        new_root,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Withdrawal successful: {} tokens to {}", amount, recipient);
    Ok(())
}
