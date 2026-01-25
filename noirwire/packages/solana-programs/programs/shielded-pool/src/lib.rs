use anchor_lang::prelude::*;

declare_id!("4482RjJ8aDEYjuUbd7af35K918tGZHZb3xeMqxF8SMx1");

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod shielded_pool {
    use super::*;

    /// Initialize a new shielded pool
    /// SECURITY (CRITICAL-05): per_authority is the only address authorized to call settle_batch
    pub fn initialize(
        ctx: Context<Initialize>,
        token_mint: Pubkey,
        vk_hash: [u8; 32],
        per_authority: Pubkey,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, token_mint, vk_hash, per_authority)
    }

    /// Initialize the Historical Roots PDA for production-scale merkle root storage
    ///
    /// Creates a separate account storing 900 historical roots (~6 min spending window).
    /// Should be called after initialize() for production deployments.
    pub fn init_historical_roots(ctx: Context<InitializeHistoricalRoots>) -> Result<()> {
        instructions::init_historical_roots::handler(ctx)
    }

    /// Deposit tokens into the shielded pool (shield)
    /// Requires a valid ZK proof that the commitment is correctly formed
    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        proof_data: state::DepositProofData,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, amount, proof_data)
    }

    /// Withdraw tokens from the shielded pool (unshield)
    /// Requires a valid ZK proof of ownership and sufficient balance
    pub fn withdraw(
        ctx: Context<Withdraw>,
        proof_data: state::WithdrawProofData,
        recipient: Pubkey,
    ) -> Result<()> {
        instructions::withdraw::handler(ctx, proof_data, recipient)
    }

    /// Batch settlement from PER (multiple nullifiers + new root)
    /// SECURITY (CRITICAL-03): Verifies batch ZK proof before updating state
    pub fn settle_batch(
        ctx: Context<SettleBatch>,
        proof_data: state::BatchSettlementProofData,
    ) -> Result<()> {
        instructions::settle_batch::handler(ctx, proof_data)
    }

    /// Record individual nullifier after batch settlement
    /// SECURITY (CRITICAL-04): Creates nullifier PDA with merkle proof verification
    /// Called by indexer/PER after settle_batch to prevent double-spend
    pub fn record_nullifier(
        ctx: Context<RecordNullifier>,
        nullifier: [u8; 32],
        nullifiers_root: [u8; 32],
        merkle_proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::record_nullifier::handler(ctx, nullifier, nullifiers_root, merkle_proof)
    }

    /// Emergency pause (admin only)
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }
}
