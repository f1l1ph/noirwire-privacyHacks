use anchor_lang::prelude::*;

#[error_code]
pub enum PoolError {
    #[msg("Pool is currently paused")]
    PoolPaused,

    #[msg("Invalid token mint")]
    InvalidMint,

    #[msg("Invalid merkle root")]
    InvalidMerkleRoot,

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
}
