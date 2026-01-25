use anchor_lang::prelude::*;

/// Error codes for the ZK Verifier program
///
/// These errors map to the groth16-solana library errors and provide
/// user-friendly messages for common verification failures.
#[error_code]
pub enum VerifierError {
    #[msg("Invalid proof - verification failed")]
    InvalidProof,

    #[msg("Proof verification failed - cryptographic check did not pass")]
    ProofVerificationFailed,

    #[msg("BN128 elliptic curve operation error")]
    Bn128Error,

    #[msg("Pairing check failed")]
    PairingFailed,

    #[msg("Public input count mismatch with verification key")]
    InputCountMismatch,

    #[msg("Invalid verification key - IC length does not match public input count")]
    InvalidVerificationKey,

    #[msg("Public input value exceeds BN254 field modulus")]
    PublicInputOutOfRange,

    #[msg("Invalid proof format - incorrect point encoding or byte length")]
    InvalidProofFormat,

    #[msg("Unauthorized: only pool authority can store verification keys")]
    Unauthorized,

    #[msg("Invalid pool account data")]
    InvalidPoolAccount,
}
