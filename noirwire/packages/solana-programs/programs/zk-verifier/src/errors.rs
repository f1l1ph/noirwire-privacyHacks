use anchor_lang::prelude::*;

#[error_code]
pub enum VerifierError {
    #[msg("Invalid proof - verification failed")]
    InvalidProof,

    #[msg("BN128 operation error")]
    Bn128Error,

    #[msg("Pairing check failed")]
    PairingFailed,

    #[msg("Public input count mismatch with verification key")]
    InputCountMismatch,

    #[msg("Invalid verification key")]
    InvalidVerificationKey,
}
