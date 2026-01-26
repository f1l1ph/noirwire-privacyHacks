use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PoolState::INIT_SPACE,
        seeds = [b"pool", token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, PoolState>,

    /// Token mint for this pool
    pub token_mint: Account<'info, Mint>,

    /// Pool's token vault
    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = pool_authority,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// Pool authority PDA (for signing vault transfers)
    /// CHECK: PDA verified by seeds
    #[account(
        seeds = [b"authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    /// Pool admin (payer)
    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    token_mint: Pubkey,
    vk_hash: [u8; 32],
    per_authority: Pubkey,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let current_slot = Clock::get()?.slot;

    // SECURITY (LOW-03): Set version for future migration support
    pool.version = POOL_STATE_VERSION;

    pool.authority = ctx.accounts.authority.key();
    pool.per_authority = per_authority; // CRITICAL-05: PER authority for batch settlement
    pool.token_mint = token_mint;
    pool.token_vault = ctx.accounts.pool_vault.key();
    pool.vk_hash = vk_hash;
    pool.commitment_root = [0u8; 32]; // Empty tree root
    pool.commitment_root_slot = current_slot; // SECURITY (HIGH-01): Track root slot
    pool.historical_roots = [[0u8; 32]; HISTORICAL_ROOTS_SIZE]; // Production: 900 slots = 6 min window
    pool.historical_roots_slots = [0u64; HISTORICAL_ROOTS_SIZE]; // SECURITY (HIGH-01): Track historical slots
    pool.roots_index = 0;
    pool.total_shielded = 0;
    pool.paused = false;
    pool.emergency_mode = false; // SECURITY (LOW-01): Emergency mode starts disabled
    pool.total_deposits = 0;
    pool.total_withdrawals = 0;
    pool.total_nullifiers = 0;
    pool.last_nullifiers_root = [0u8; 32];
    pool.bump = ctx.bumps.pool;
    pool._reserved = Vec::new();

    msg!("Pool initialized for mint: {}", token_mint);
    msg!("Pool version: {}", POOL_STATE_VERSION);
    msg!("PER authority: {}", per_authority);
    msg!("Verification key hash: {:?}", vk_hash);
    msg!("Initial slot: {}", current_slot);

    Ok(())
}
