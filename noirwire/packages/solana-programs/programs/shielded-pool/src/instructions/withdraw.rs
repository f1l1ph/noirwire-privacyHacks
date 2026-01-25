use crate::errors::PoolError;
use crate::events::WithdrawEvent;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use zk_verifier::cpi;
use zk_verifier::cpi::accounts::VerifyProof;
use zk_verifier::program::ZkVerifier;
use zk_verifier::state::VerificationKey;

#[derive(Accounts)]
#[instruction(proof_data: WithdrawProofData, recipient: Pubkey)]
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
        seeds = [b"nullifier", pool.key().as_ref(), &proof_data.nullifier],
        bump
    )]
    pub nullifier_entry: Account<'info, NullifierEntry>,

    /// Verification key account (for ZK proof verification)
    /// SECURITY: Verified to be for this pool and withdraw circuit
    #[account(
        constraint = verification_key.pool == pool.key() @ PoolError::InvalidVerificationKey,
        constraint = verification_key.circuit_id == proof::circuit_ids::WITHDRAW @ PoolError::InvalidVerificationKey
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// ZK Verifier program (for CPI verification)
    pub verifier_program: Program<'info, ZkVerifier>,

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
    proof_data: WithdrawProofData,
    recipient: Pubkey,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let nullifier = proof_data.nullifier;

    // SECURITY: Verify recipient matches proof to prevent token diversion
    // Convert recipient from field bytes to Pubkey
    let proof_recipient = Pubkey::new_from_array(proof_data.recipient);
    require!(recipient == proof_recipient, PoolError::InvalidRecipient);

    // 1. Extract amount from proof (convert from field back to u64)
    let amount = field_to_u64(&proof_data.amount)?;

    // 2. Validate old_root matches current pool root (must be in historical roots)
    require!(
        pool.is_valid_root(&proof_data.old_root),
        PoolError::InvalidMerkleRoot
    );

    // 3. Request compute budget for ZK verification (~600k CU)
    msg!("Verifying withdrawal proof (estimated 600k CU)");

    // 4. Verify ZK proof via CPI to zk-verifier program
    let verify_cpi_ctx = CpiContext::new(
        ctx.accounts.verifier_program.to_account_info(),
        VerifyProof {
            verification_key: ctx.accounts.verification_key.to_account_info(),
        },
    );

    let public_inputs = proof_data.public_inputs();
    cpi::verify(verify_cpi_ctx, proof_data.proof, public_inputs)?;

    msg!("ZK proof verified successfully");

    // 5. Record nullifier (account creation proves uniqueness)
    // This MUST be done after proof verification to prevent double-spend
    let nullifier_entry = &mut ctx.accounts.nullifier_entry;
    nullifier_entry.nullifier = nullifier;
    nullifier_entry.slot = Clock::get()?.slot;
    nullifier_entry.bump = ctx.bumps.nullifier_entry;

    // 5.5. SECURITY (CRITICAL-07): Verify pool has sufficient balance before transfer
    require!(
        pool.total_shielded >= amount,
        PoolError::InsufficientPoolBalance
    );

    require!(
        ctx.accounts.pool_vault.amount >= amount,
        PoolError::InsufficientVaultBalance
    );

    msg!(
        "Balance check passed: pool={}, vault={}",
        pool.total_shielded,
        ctx.accounts.pool_vault.amount
    );

    // 6. Transfer tokens from pool to recipient
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

    // 7. Update pool state with new merkle root from proof
    let new_root = proof_data.new_root;
    pool.update_root(new_root);
    pool.total_shielded = pool
        .total_shielded
        .checked_sub(amount)
        .ok_or(PoolError::Underflow)?;

    // SECURITY (MEDIUM-03): Use checked arithmetic for statistics
    pool.total_withdrawals = pool
        .total_withdrawals
        .checked_add(1)
        .ok_or(PoolError::Overflow)?;
    pool.total_nullifiers = pool
        .total_nullifiers
        .checked_add(1)
        .ok_or(PoolError::Overflow)?;

    // 8. Emit event
    emit!(WithdrawEvent {
        pool: pool.key(),
        nullifier,
        amount,
        recipient,
        new_root,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Withdrawal successful: {} tokens to {}, new root: {:?}",
        amount,
        recipient,
        new_root
    );
    Ok(())
}
