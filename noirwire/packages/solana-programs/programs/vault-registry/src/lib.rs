use anchor_lang::prelude::*;

// MagicBlock SDK imports for Permission Program CPI
use ephemeral_rollups_sdk::access_control::instructions::{
    CreatePermissionCpiBuilder, UpdatePermissionCpiBuilder,
};
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;

declare_id!("FWaonsWs2LpGTWBEPntPBvPSeKxjcXNeRBRcsuKT9x18");

pub mod errors;
pub mod events;
pub mod state;

use errors::*;
use events::*;
use state::*;

#[program]
pub mod vault_registry {
    use super::*;

    /// Create a new vault with PER Permission integration
    ///
    /// This instruction:
    /// 1. Creates a Vault PDA to store vault metadata
    /// 2. Calls PER Permission Program via CPI to create a permission account
    /// 3. The admin becomes the authority member with full access
    pub fn create_vault(ctx: Context<CreateVault>, vault_id: [u8; 32], name: String) -> Result<()> {
        require!(name.len() <= 32, VaultError::NameTooLong);

        let vault = &mut ctx.accounts.vault;

        // SECURITY (LOW-03): Set version for future migration support
        vault.version = VAULT_STATE_VERSION;

        vault.vault_id = vault_id;
        vault.name = name.clone();
        vault.admin = ctx.accounts.admin.key();
        vault.created_at = Clock::get()?.unix_timestamp;
        vault.bump = ctx.bumps.vault;

        // Store the permission PDA
        vault.permission = ctx.accounts.permission.key();

        // Create members array with admin as authority member
        let members = vec![Member {
            flags: (permission_flags::AUTHORITY_FLAG | permission_flags::ALL_VIEW_FLAGS) as u8,
            pubkey: ctx.accounts.admin.key(),
        }];

        // Build vault PDA seeds for signing
        let vault_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &[ctx.bumps.vault]];

        // CPI to Permission Program using SDK builder
        CreatePermissionCpiBuilder::new(&ctx.accounts.per_permission_program.to_account_info())
            .permissioned_account(&ctx.accounts.vault.to_account_info())
            .permission(&ctx.accounts.permission)
            .payer(&ctx.accounts.admin)
            .system_program(&ctx.accounts.system_program)
            .args(MembersArgs {
                members: Some(members),
            })
            .invoke_signed(&[vault_seeds])?;

        emit!(VaultCreatedEvent {
            vault_id,
            admin: ctx.accounts.admin.key(),
            name,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "Vault created with permission: {:?}",
            ctx.accounts.permission.key()
        );
        Ok(())
    }

    /// Add a member to the vault
    ///
    /// Calls PER Permission Program to update the permission account
    /// with the new member and their role-based flags
    pub fn add_vault_member(
        ctx: Context<ManageVault>,
        _vault_id: [u8; 32],
        member: Pubkey,
        role: VaultRole,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let flags = role.to_flags();

        // Create members array with the new member
        let members = vec![Member {
            flags: flags as u8,
            pubkey: member,
        }];

        // CPI to Permission Program using SDK builder
        // Admin has authority to update permissions
        UpdatePermissionCpiBuilder::new(&ctx.accounts.per_permission_program.to_account_info())
            .permissioned_account(&ctx.accounts.vault.to_account_info(), false)
            .authority(&ctx.accounts.admin.to_account_info(), true)
            .permission(&ctx.accounts.permission)
            .args(MembersArgs {
                members: Some(members),
            })
            .invoke()?;

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
    ///
    /// Calls PER Permission Program to update the permission account
    /// removing the member (by setting their flags to 0)
    pub fn remove_vault_member(
        ctx: Context<ManageVault>,
        _vault_id: [u8; 32],
        member: Pubkey,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        // To remove a member, set their flags to 0
        let members = vec![Member {
            flags: 0u8,
            pubkey: member,
        }];

        // CPI to Permission Program using SDK builder
        UpdatePermissionCpiBuilder::new(&ctx.accounts.per_permission_program.to_account_info())
            .permissioned_account(&ctx.accounts.vault.to_account_info(), false)
            .authority(&ctx.accounts.admin.to_account_info(), true)
            .permission(&ctx.accounts.permission)
            .args(MembersArgs {
                members: Some(members),
            })
            .invoke()?;

        emit!(MemberRemovedEvent {
            vault_id: vault.vault_id,
            member,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Removed member {} from vault", member);
        Ok(())
    }

    /// Close the vault and its permission account
    ///
    /// Note: Currently, the Permission Program may not have a close instruction exposed via SDK.
    /// We clear the permission by setting members to None (empty permission).
    /// The vault PDA close is handled by Anchor's `close` constraint.
    pub fn close_vault(ctx: Context<CloseVault>, vault_id: [u8; 32]) -> Result<()> {
        // Clear permission members before closing vault
        // This effectively "closes" the permission by removing all access
        UpdatePermissionCpiBuilder::new(&ctx.accounts.per_permission_program.to_account_info())
            .permissioned_account(&ctx.accounts.vault.to_account_info(), false)
            .authority(&ctx.accounts.admin.to_account_info(), true)
            .permission(&ctx.accounts.permission)
            .args(MembersArgs { members: None })
            .invoke()?;

        emit!(VaultClosedEvent {
            vault_id,
            admin: ctx.accounts.admin.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Vault closed: {:?}", vault_id);
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

    /// Permission account PDA (derived from vault by Permission Program)
    /// CHECK: This is initialized by the Permission Program CPI
    #[account(
        mut,
        seeds = [b"permission", vault.key().as_ref()],
        seeds::program = PERMISSION_PROGRAM_ID,
        bump
    )]
    pub permission: AccountInfo<'info>,

    /// MagicBlock Permission Program
    /// CHECK: Verified by constraint
    #[account(
        constraint = per_permission_program.key() == PERMISSION_PROGRAM_ID @ VaultError::InvalidPermissionProgram
    )]
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

    /// Permission account (must match vault.permission)
    /// CHECK: Validated against vault.permission
    #[account(
        mut,
        constraint = permission.key() == vault.permission @ VaultError::PermissionMismatch
    )]
    pub permission: AccountInfo<'info>,

    /// MagicBlock Permission Program
    /// CHECK: Verified by constraint
    #[account(
        constraint = per_permission_program.key() == PERMISSION_PROGRAM_ID @ VaultError::InvalidPermissionProgram
    )]
    pub per_permission_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(vault_id: [u8; 32])]
pub struct CloseVault<'info> {
    #[account(
        mut,
        close = admin,
        has_one = admin,
        seeds = [b"vault", vault_id.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// Permission account (must match vault.permission)
    /// CHECK: Validated against vault.permission
    #[account(
        mut,
        constraint = permission.key() == vault.permission @ VaultError::PermissionMismatch
    )]
    pub permission: AccountInfo<'info>,

    /// MagicBlock Permission Program
    /// CHECK: Verified by constraint
    #[account(
        constraint = per_permission_program.key() == PERMISSION_PROGRAM_ID @ VaultError::InvalidPermissionProgram
    )]
    pub per_permission_program: AccountInfo<'info>,
}
