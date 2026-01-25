use anchor_lang::prelude::*;

// Re-export PERMISSION_PROGRAM_ID from SDK
pub use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;

/// Permission flags from MagicBlock SDK
/// These match ephemeral_rollups_sdk::access_control::structs constants
/// Note: SDK uses u8 for flags field
pub mod permission_flags {
    /// Authority flag - can modify permission settings, add/remove members
    pub const AUTHORITY_FLAG: u64 = 1 << 0;
    /// Can view transaction logs
    pub const TX_LOGS_FLAG: u64 = 1 << 1;
    /// Can view account balance changes
    pub const TX_BALANCES_FLAG: u64 = 1 << 2;
    /// Can view transaction message data
    pub const TX_MESSAGE_FLAG: u64 = 1 << 3;
    /// Can view account signatures
    pub const ACCOUNT_SIGNATURES_FLAG: u64 = 1 << 4;

    /// All view permissions combined
    pub const ALL_VIEW_FLAGS: u64 =
        TX_LOGS_FLAG | TX_BALANCES_FLAG | TX_MESSAGE_FLAG | ACCOUNT_SIGNATURES_FLAG;
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Unique vault identifier
    pub vault_id: [u8; 32],

    /// Human-readable name (max 32 chars)
    #[max_len(32)]
    pub name: String,

    /// Admin who controls membership
    pub admin: Pubkey,

    /// Permission PDA address (derived from vault PDA)
    /// Used by MagicBlock Permission Program for access control
    pub permission: Pubkey,

    /// Unix timestamp
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

/// Vault member role - determines permission flags
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum VaultRole {
    /// Can only view vault data
    Viewer,
    /// Can view and interact with vault
    Member,
    /// Full admin access (AUTHORITY_FLAG)
    Admin,
}

impl VaultRole {
    /// Convert role to permission flags
    pub fn to_flags(&self) -> u64 {
        match self {
            VaultRole::Viewer => {
                permission_flags::TX_LOGS_FLAG | permission_flags::TX_BALANCES_FLAG
            }
            VaultRole::Member => permission_flags::ALL_VIEW_FLAGS,
            VaultRole::Admin => permission_flags::AUTHORITY_FLAG | permission_flags::ALL_VIEW_FLAGS,
        }
    }
}

/// Helper to derive permission PDA from vault PDA
pub fn find_permission_pda(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"permission", vault.as_ref()], &PERMISSION_PROGRAM_ID)
}
