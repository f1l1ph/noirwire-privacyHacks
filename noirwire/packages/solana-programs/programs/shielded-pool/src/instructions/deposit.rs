use crate::errors::PoolError;
use crate::events::DepositEvent;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use zk_verifier::cpi;
use zk_verifier::cpi::accounts::VerifyProof;
use zk_verifier::program::ZkVerifier;
use zk_verifier::state::VerificationKey;

#[derive(Accounts)]
#[instruction(amount: u64, proof_data: DepositProofData)]
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

    /// Verification key account (for ZK proof verification)
    /// SECURITY: Verified to be for this pool and deposit circuit
    #[account(
        constraint = verification_key.pool == pool.key() @ PoolError::InvalidVerificationKey,
        constraint = verification_key.circuit_id == proof::circuit_ids::DEPOSIT @ PoolError::InvalidVerificationKey
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// ZK Verifier program (for CPI verification)
    pub verifier_program: Program<'info, ZkVerifier>,

    /// Depositor (signer)
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// Historical roots PDA for extended spending window (optional for production)
    /// SECURITY (CRITICAL-02): When provided, new roots are also pushed here
    /// for 900-slot (~6 min) spending window
    /// Uses borsh serialization for Vec support in 900-root buffer
    #[account(
        mut,
        seeds = [HISTORICAL_ROOTS_SEED, pool.key().as_ref()],
        bump,
    )]
    pub historical_roots: Option<Account<'info, HistoricalRoots>>,

    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64, proof_data: DepositProofData) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let current_slot = Clock::get()?.slot;

    // 1. SECURITY (MEDIUM-04): Enforce minimum deposit to prevent spam
    // This protects against merkle tree bloating and compute exhaustion attacks
    require!(
        amount >= MIN_DEPOSIT_SPL_UNITS,
        PoolError::DepositBelowMinimum
    );

    // 2. Request compute budget for ZK verification (~600k CU)
    // This is done implicitly by the syscall, but we can log the estimate
    msg!("Verifying deposit proof (estimated 600k CU)");

    // 3. Verify amount matches proof
    let proof_amount = u64_to_field(amount);
    require!(
        proof_data.deposit_amount == proof_amount,
        PoolError::InvalidProof
    );

    // 4. Verify old_root matches current pool root
    require!(
        proof_data.old_root == pool.commitment_root,
        PoolError::InvalidMerkleRoot
    );

    // 5. SECURITY (HIGH-02): Verify VK hash matches pool's expected VK
    // This prevents VK substitution attacks if admin key is compromised
    let vk_data = ctx.accounts.verification_key.try_to_vec()?;
    let vk_hash = keccak::hash(&vk_data);
    require!(
        pool.vk_hash == vk_hash.to_bytes(),
        PoolError::VerificationKeyHashMismatch
    );

    // 6. Verify ZK proof via CPI to zk-verifier program
    let verify_cpi_ctx = CpiContext::new(
        ctx.accounts.verifier_program.to_account_info(),
        VerifyProof {
            verification_key: ctx.accounts.verification_key.to_account_info(),
        },
    );

    let public_inputs = proof_data.public_inputs();
    cpi::verify(verify_cpi_ctx, proof_data.proof, public_inputs)?;

    msg!("ZK proof verified successfully");

    // 7. Transfer tokens from user to pool vault
    // SECURITY (CRITICAL-06): Verify actual transfer amount matches declared amount
    let vault_balance_before = ctx.accounts.pool_vault.amount;

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Reload vault account to get updated balance
    ctx.accounts.pool_vault.reload()?;
    let vault_balance_after = ctx.accounts.pool_vault.amount;

    // Verify actual transferred amount matches requested amount
    let actual_transferred = vault_balance_after
        .checked_sub(vault_balance_before)
        .ok_or(PoolError::Underflow)?;

    require!(
        actual_transferred == amount,
        PoolError::InvalidTransferAmount
    );

    msg!("Transfer verified: {} tokens", actual_transferred);

    // 8. Update pool state with new merkle root from proof
    let new_root = proof_data.new_root;
    let old_root = pool.commitment_root;
    pool.update_root(new_root, current_slot);
    pool.total_shielded = pool
        .total_shielded
        .checked_add(actual_transferred)
        .ok_or(PoolError::Overflow)?;
    pool.total_deposits = pool
        .total_deposits
        .checked_add(1)
        .ok_or(PoolError::Overflow)?;

    // 9. SECURITY (CRITICAL-02): Also push to HistoricalRoots PDA if available
    // This provides the extended 900-slot (~6 min) spending window
    if let Some(ref mut historical_roots) = ctx.accounts.historical_roots {
        // Verify the historical roots account belongs to this pool
        require!(
            historical_roots.pool == pool.key(),
            PoolError::InvalidVerificationKey
        );
        // Push the OLD root before it gets overwritten (same as pool.update_root)
        historical_roots.push(old_root, current_slot);
        msg!("Root pushed to extended historical buffer (900-slot capacity)");
    }

    // 10. Emit event
    emit!(DepositEvent {
        pool: pool.key(),
        commitment: proof_data.new_commitment,
        amount,
        new_root,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Deposit successful: {} tokens, new root: {:?}",
        amount,
        new_root
    );
    Ok(())
}
