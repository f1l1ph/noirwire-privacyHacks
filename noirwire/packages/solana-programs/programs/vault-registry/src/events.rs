use anchor_lang::prelude::*;
use crate::state::VaultRole;

#[event]
pub struct VaultCreatedEvent {
    pub vault_id: [u8; 32],
    pub admin: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct MemberAddedEvent {
    pub vault_id: [u8; 32],
    pub member: Pubkey,
    pub role: VaultRole,
    pub timestamp: i64,
}

#[event]
pub struct MemberRemovedEvent {
    pub vault_id: [u8; 32],
    pub member: Pubkey,
    pub timestamp: i64,
}
