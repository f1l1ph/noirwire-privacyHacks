use anchor_lang::prelude::*;

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

    /// PER Permission Group ID
    /// This is the group that controls access
    pub permission_group: [u8; 32],

    /// Unix timestamp
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum VaultRole {
    Viewer,
    Member,
    Admin,
}
