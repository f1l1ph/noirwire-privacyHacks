use anchor_lang::prelude::*;

declare_id!("DTBnMWLQw3rp3MhL7mf3BNk68Qhq2Kr4zcJJpNVVAXQD");

pub mod errors;
pub mod groth16;
pub mod state;

use groth16::{Groth16Proof, Groth16VerifyingKey};
use state::*;

#[program]
pub mod zk_verifier {
    use super::*;

    /// Verify a Groth16 proof
    /// Requires ~150k-200k compute units
    pub fn verify(
        ctx: Context<VerifyProof>,
        proof: Groth16Proof,
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        let vk_account = &ctx.accounts.verification_key;

        // Convert account data to Groth16VerifyingKey structure
        let vk = Groth16VerifyingKey {
            nr_public_inputs: public_inputs.len() as u32,
            alpha_g1: vk_account.alpha_g1,
            beta_g2: vk_account.beta_g2,
            gamma_g2: vk_account.gamma_g2,
            delta_g2: vk_account.delta_g2,
            ic: vk_account.ic.clone(),
        };

        // Verify proof using groth16-solana library
        let result = groth16::verify_proof(&vk, &proof, &public_inputs)?;

        require!(result, errors::VerifierError::InvalidProof);

        msg!("Proof verified successfully");
        Ok(())
    }

    /// Store a verification key for a circuit
    /// SECURITY (CRITICAL-08): Only pool authority can store/update VKs
    pub fn store_vk(
        ctx: Context<StoreVk>,
        circuit_id: [u8; 32],
        vk_data: VerificationKeyData,
    ) -> Result<()> {
        // SECURITY: Validate authority is pool admin
        // Pool account data layout (from shielded-pool PoolState):
        // - 8 bytes: discriminator
        // - 32 bytes: authority pubkey (offset 8)
        // - 32 bytes: per_authority (offset 40)
        // - ... rest of fields
        let pool_data = ctx.accounts.pool.try_borrow_data()?;

        // Verify account has enough data
        require!(
            pool_data.len() >= 40,
            errors::VerifierError::InvalidPoolAccount
        );

        // Extract authority pubkey from pool data (bytes 8-40)
        let mut authority_bytes = [0u8; 32];
        authority_bytes.copy_from_slice(&pool_data[8..40]);
        let pool_authority = Pubkey::new_from_array(authority_bytes);

        // Verify signer is pool authority
        require!(
            pool_authority == ctx.accounts.authority.key(),
            errors::VerifierError::Unauthorized
        );

        msg!("Authorization verified: authority is pool admin");

        let vk = &mut ctx.accounts.verification_key;

        vk.pool = ctx.accounts.pool.key();
        vk.circuit_id = circuit_id;
        vk.alpha_g1 = vk_data.alpha_g1;
        vk.beta_g2 = vk_data.beta_g2;
        vk.gamma_g2 = vk_data.gamma_g2;
        vk.delta_g2 = vk_data.delta_g2;
        vk.ic_length = vk_data.ic.len() as u8;
        vk.ic = vk_data.ic;
        vk.bump = ctx.bumps.verification_key;

        msg!("Verification key stored for circuit: {:?}", circuit_id);
        Ok(())
    }

    /// Update an existing verification key
    /// SECURITY (HIGH-05): Only pool authority can update VKs
    pub fn update_vk(ctx: Context<UpdateVk>, vk_data: VerificationKeyData) -> Result<()> {
        // SECURITY: Validate authority is pool admin (same as store_vk)
        let pool_data = ctx.accounts.pool.try_borrow_data()?;

        require!(
            pool_data.len() >= 40,
            errors::VerifierError::InvalidPoolAccount
        );

        let mut authority_bytes = [0u8; 32];
        authority_bytes.copy_from_slice(&pool_data[8..40]);
        let pool_authority = Pubkey::new_from_array(authority_bytes);

        require!(
            pool_authority == ctx.accounts.authority.key(),
            errors::VerifierError::Unauthorized
        );

        msg!("Authorization verified: authority is pool admin");

        let vk = &mut ctx.accounts.verification_key;

        // Update VK data (pool and circuit_id remain unchanged)
        vk.alpha_g1 = vk_data.alpha_g1;
        vk.beta_g2 = vk_data.beta_g2;
        vk.gamma_g2 = vk_data.gamma_g2;
        vk.delta_g2 = vk_data.delta_g2;
        vk.ic_length = vk_data.ic.len() as u8;
        vk.ic = vk_data.ic;

        msg!("Verification key updated for circuit: {:?}", vk.circuit_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    /// Verification key account
    pub verification_key: Account<'info, VerificationKey>,
}

#[derive(Accounts)]
#[instruction(circuit_id: [u8; 32])]
pub struct StoreVk<'info> {
    #[account(
        init,
        payer = authority,
        space = VerificationKey::size(16), // Default 16 IC points
        seeds = [b"vk", pool.key().as_ref(), &circuit_id],
        bump
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// CHECK: Pool account (validated manually in handler)
    pub pool: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateVk<'info> {
    /// Existing verification key to update
    #[account(
        mut,
        seeds = [b"vk", pool.key().as_ref(), &verification_key.circuit_id],
        bump = verification_key.bump
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// CHECK: Pool account (validated manually in handler)
    pub pool: AccountInfo<'info>,

    pub authority: Signer<'info>,
}
