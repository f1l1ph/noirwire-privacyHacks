use anchor_lang::prelude::*;

declare_id!("GHaaCGvizKd7QVCw93vHHc3bDQ1JNdufT4ZX9RbeR6Pj");

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod shielded_pool {
    use super::*;

    /// Initialize a new shielded pool
    pub fn initialize(
        ctx: Context<Initialize>,
        token_mint: Pubkey,
        vk_hash: [u8; 32],
    ) -> Result<()> {
        instructions::initialize::handler(ctx, token_mint, vk_hash)
    }

    /// Deposit tokens into the shielded pool (shield)
    pub fn deposit(ctx: Context<Deposit>, amount: u64, commitment: [u8; 32]) -> Result<()> {
        instructions::deposit::handler(ctx, amount, commitment)
    }

    /// Withdraw tokens from the shielded pool (unshield)
    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount: u64,
        nullifier: [u8; 32],
        recipient: Pubkey,
    ) -> Result<()> {
        instructions::withdraw::handler(ctx, amount, nullifier, recipient)
    }

    /// Batch settlement from PER (multiple nullifiers + new root)
    pub fn settle_batch(
        ctx: Context<SettleBatch>,
        new_root: [u8; 32],
        nullifiers_root: [u8; 32],
        nullifier_count: u32,
    ) -> Result<()> {
        instructions::settle_batch::handler(ctx, new_root, nullifiers_root, nullifier_count)
    }

    /// Emergency pause (admin only)
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }
}
