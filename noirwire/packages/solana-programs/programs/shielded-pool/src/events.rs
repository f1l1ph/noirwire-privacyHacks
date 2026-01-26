use anchor_lang::prelude::*;

#[event]
pub struct DepositEvent {
    pub pool: Pubkey,
    pub commitment: [u8; 32],
    pub amount: u64,
    pub new_root: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct WithdrawEvent {
    pub pool: Pubkey,
    pub nullifier: [u8; 32],
    pub amount: u64,
    pub recipient: Pubkey,
    pub new_root: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct BatchSettlementEvent {
    pub pool: Pubkey,
    pub old_root: [u8; 32],
    pub new_root: [u8; 32],
    pub nullifiers_root: [u8; 32],
    pub nullifier_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyPauseEvent {
    pub pool: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyModeEvent {
    pub pool: Pubkey,
    pub emergency_mode: bool,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyWithdrawEvent {
    pub pool: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct NullifierRecordedEvent {
    pub pool: Pubkey,
    pub nullifier: [u8; 32],
    pub nullifiers_root: [u8; 32],
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct NullifierCleanupEvent {
    pub pool: Pubkey,
    pub nullifier: [u8; 32],
    pub original_slot: u64,
    pub cleanup_slot: u64,
    pub rent_recovered: u64,
    pub timestamp: i64,
}
