use anchor_lang::prelude::*;

declare_id!("FXVuM3iLQgejHHoTw6Gqh77MEGcniR6VK8sHTwPSRSvG");

pub mod state;
pub mod errors;
pub mod events;

use state::*;
use errors::*;
use events::*;

#[program]
pub mod vault_registry {
    use super::*;

    /// Create a new vault
    /// Calls PER Permission Program to create permission group
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: [u8; 32],
        name: String,
    ) -> Result<()> {
        require!(name.len() <= 32, VaultError::NameTooLong);

        let vault = &mut ctx.accounts.vault;
        vault.vault_id = vault_id;
        vault.name = name.clone();
        vault.admin = ctx.accounts.admin.key();
        vault.created_at = Clock::get()?.unix_timestamp;
        vault.bump = ctx.bumps.vault;

        // TODO: CPI to PER Permission Program to create group
        // For now, use a placeholder permission group
        vault.permission_group = vault_id; // Placeholder

        emit!(VaultCreatedEvent {
            vault_id,
            admin: ctx.accounts.admin.key(),
            name,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Vault created: {:?}", vault_id);
        Ok(())
    }

    /// Add a member to the vault
    /// Calls PER Permission Program to add to group
    pub fn add_vault_member(
        ctx: Context<ManageVault>,
        _vault_id: [u8; 32],
        member: Pubkey,
        role: VaultRole,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        // TODO: CPI to PER Permission Program to add member
        // invoke_per_add_member(...)?;

        emit!(MemberAddedEvent {
            vault_id: vault.vault_id,
            member,
            role: role.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Added member {} to vault with role {:?}", member, role);
        Ok(())
    }

    /// Remove a member from the vault
    /// Calls PER Permission Program to remove from group
    pub fn remove_vault_member(
        ctx: Context<ManageVault>,
        _vault_id: [u8; 32],
        member: Pubkey,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        // TODO: CPI to PER Permission Program to remove member
        // invoke_per_remove_member(...)?;

        emit!(MemberRemovedEvent {
            vault_id: vault.vault_id,
            member,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Removed member {} from vault", member);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(vault_id: [u8; 32])]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", vault_id.as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: PER Permission Program (will be used for CPI)
    pub per_permission_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageVault<'info> {
    #[account(
        mut,
        has_one = admin,
        seeds = [b"vault", vault.vault_id.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub admin: Signer<'info>,

    /// CHECK: PER Permission Program (will be used for CPI)
    pub per_permission_program: AccountInfo<'info>,
}
