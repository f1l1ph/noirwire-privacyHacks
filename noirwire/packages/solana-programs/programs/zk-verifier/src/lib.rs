use anchor_lang::prelude::*;

declare_id!("E2iDwQ5pjSk4qxmXj7U1NUsqPyFGyfeVYj1CBXqL6fBw");

pub mod errors;
pub mod groth16;
pub mod state;

use groth16::*;
use state::*;

#[program]
pub mod zk_verifier {
    use super::*;

    /// Verify a Groth16 proof
    /// Requires ~200k-400k compute units depending on public inputs
    pub fn verify(
        ctx: Context<VerifyProof>,
        proof: Groth16Proof,
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        let vk = &ctx.accounts.verification_key;

        // Verify proof using alt_bn128 pairing
        let result = groth16::verify_proof(
            &vk.alpha_g1,
            &vk.beta_g2,
            &vk.gamma_g2,
            &vk.delta_g2,
            &vk.ic,
            &proof,
            &public_inputs,
        )?;

        require!(result, errors::VerifierError::InvalidProof);

        msg!("Proof verified successfully");
        Ok(())
    }

    /// Store a verification key for a circuit
    pub fn store_vk(
        ctx: Context<StoreVk>,
        circuit_id: [u8; 32],
        vk_data: VerificationKeyData,
    ) -> Result<()> {
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

    /// CHECK: Pool account
    pub pool: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
