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
