use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Vault name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Not authorized to access this vault")]
    NotAuthorized,

    #[msg("Invalid vault member")]
    InvalidMember,

    #[msg("Vault does not exist")]
    VaultNotFound,

    #[msg("Invalid Permission Program")]
    InvalidPermissionProgram,

    #[msg("Permission account mismatch")]
    PermissionMismatch,

    #[msg("Permission CPI failed")]
    PermissionCpiFailed,
}
