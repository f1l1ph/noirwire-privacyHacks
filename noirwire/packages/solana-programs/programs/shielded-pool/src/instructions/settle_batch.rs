use crate::errors::PoolError;
use crate::events::BatchSettlementEvent;
use crate::state::*;
use anchor_lang::prelude::*;
use zk_verifier::cpi;
use zk_verifier::cpi::accounts::VerifyProof;
use zk_verifier::program::ZkVerifier;
use zk_verifier::state::VerificationKey;

#[derive(Accounts)]
#[instruction(proof_data: BatchSettlementProofData)]
pub struct SettleBatch<'info> {
    /// Pool state
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.paused @ PoolError::PoolPaused,
        constraint = pool.per_authority == per_authority.key() @ PoolError::Unauthorized
    )]
    pub pool: Account<'info, PoolState>,

    /// Verification key account (for batch settlement circuit)
    /// SECURITY: Verified to be for this pool and batch settlement circuit
    #[account(
        constraint = verification_key.pool == pool.key() @ PoolError::InvalidVerificationKey,
        constraint = verification_key.circuit_id == proof::circuit_ids::BATCH_SETTLEMENT @ PoolError::InvalidVerificationKey
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// ZK Verifier program (for CPI verification)
    pub verifier_program: Program<'info, ZkVerifier>,

    /// PER authority (MagicBlock delegation)
    /// SECURITY: Only this authorized PER can call settle_batch (CRITICAL-05)
    pub per_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SettleBatch>, proof_data: BatchSettlementProofData) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let current_slot = Clock::get()?.slot;

    // Extract values from proof
    let new_root = proof_data.new_root;
    let nullifiers_root = proof_data.nullifiers_root;
    let nullifier_count = field_to_u32(&proof_data.nullifier_count)?;

    // SECURITY (CRITICAL-03): Verify batch ZK proof
    // The batch circuit proves:
    // - All nullifiers are valid (double-spend prevention)
    // - State transition from old_root to new_root is correct
    // - nullifiers_root is the merkle root of all batch nullifiers

    // 1. Verify old_root in proof matches current pool root
    require!(
        proof_data.old_root == pool.commitment_root,
        PoolError::InvalidMerkleRoot
    );

    msg!("Verifying batch settlement proof (estimated 600k CU)");

    // 2. Verify batch ZK proof via CPI to zk-verifier program
    let verify_cpi_ctx = CpiContext::new(
        ctx.accounts.verifier_program.to_account_info(),
        VerifyProof {
            verification_key: ctx.accounts.verification_key.to_account_info(),
        },
    );

    let public_inputs = proof_data.public_inputs();
    cpi::verify(verify_cpi_ctx, proof_data.proof, public_inputs)?;

    msg!("Batch ZK proof verified successfully");

    // 3. Store nullifiers_root for verification by record_nullifier
    // Individual nullifier PDAs are created by the indexer/PER in separate txs
    pool.last_nullifiers_root = nullifiers_root;
    pool.total_nullifiers = pool
        .total_nullifiers
        .checked_add(nullifier_count as u64)
        .ok_or(PoolError::Overflow)?;

    // 4. Update pool state with new root (only after proof verification)
    // SECURITY (HIGH-01): Pass current slot for root expiration tracking
    let old_root = pool.commitment_root;
    pool.update_root(new_root, current_slot);

    // 5. Emit event with nullifiers_root (indexer will process individual nullifiers)
    emit!(BatchSettlementEvent {
        pool: pool.key(),
        old_root,
        new_root,
        nullifiers_root,
        nullifier_count,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Batch settlement: {} nullifiers, new root: {:?}",
        nullifier_count,
        new_root
    );
    Ok(())
}

/// Helper function to convert field [u8; 32] back to u32
fn field_to_u32(field: &[u8; 32]) -> Result<u32> {
    // Check that leading bytes are zero
    if field[..28].iter().any(|&b| b != 0) {
        return err!(PoolError::InvalidProof);
    }

    let mut bytes = [0u8; 4];
    bytes.copy_from_slice(&field[28..32]);
    Ok(u32::from_be_bytes(bytes))
}
