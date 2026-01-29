use anchor_lang::prelude::*;

#[error_code]
pub enum PoolError {
    #[msg("Pool is currently paused")]
    PoolPaused,

    #[msg("Invalid token mint")]
    InvalidMint,

    #[msg("Invalid merkle root")]
    InvalidMerkleRoot,

    #[msg("Merkle root has expired (older than MAX_ROOT_AGE_SLOTS)")]
    MerkleRootExpired,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Arithmetic underflow")]
    Underflow,

    #[msg("Unauthorized operation")]
    Unauthorized,

    #[msg("Invalid nullifier proof")]
    InvalidNullifierProof,

    #[msg("Nullifier already used")]
    NullifierAlreadyUsed,

    #[msg("Invalid zero-knowledge proof")]
    InvalidProof,

    #[msg("Recipient doesn't match proof")]
    InvalidRecipient,

    #[msg("Invalid verification key")]
    InvalidVerificationKey,

    #[msg("Verification key hash mismatch - VK doesn't match pool's expected VK")]
    VerificationKeyHashMismatch,

    #[msg("Transfer amount doesn't match declared amount")]
    InvalidTransferAmount,

    #[msg("Insufficient pool balance for withdrawal")]
    InsufficientPoolBalance,

    #[msg("Insufficient vault balance for withdrawal")]
    InsufficientVaultBalance,

    #[msg("Deposit amount below minimum threshold")]
    DepositBelowMinimum,

    #[msg("Emergency mode is not active")]
    EmergencyModeNotActive,

    #[msg("Historical roots PDA not initialized")]
    HistoricalRootsNotInitialized,

    #[msg("Invalid circuit ID for this operation")]
    InvalidCircuitId,

    #[msg("Invalid PER authority - must not be zero")]
    InvalidPerAuthority,
}
