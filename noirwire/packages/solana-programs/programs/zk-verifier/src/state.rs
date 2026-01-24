use anchor_lang::prelude::*;

#[account]
pub struct VerificationKey {
    /// Pool this VK belongs to
    pub pool: Pubkey,

    /// Circuit identifier (e.g., "transfer", "batch_64")
    pub circuit_id: [u8; 32],

    /// Alpha G1 point (64 bytes - compressed)
    pub alpha_g1: [u8; 64],

    /// Beta G2 point (128 bytes - compressed)
    pub beta_g2: [u8; 128],

    /// Gamma G2 point (128 bytes)
    pub gamma_g2: [u8; 128],

    /// Delta G2 point (128 bytes)
    pub delta_g2: [u8; 128],

    /// IC (input commitments) - variable length
    /// Each IC point is 64 bytes (G1 compressed)
    pub ic_length: u8,
    pub ic: Vec<[u8; 64]>,

    /// Bump seed
    pub bump: u8,
}

impl VerificationKey {
    pub fn size(ic_count: usize) -> usize {
        8 +         // discriminator
        32 +        // pool
        32 +        // circuit_id
        64 +        // alpha_g1
        128 +       // beta_g2
        128 +       // gamma_g2
        128 +       // delta_g2
        1 +         // ic_length
        4 + (ic_count * 64) +  // ic vector
        1           // bump
    }
}

/// Verification key data for initialization
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VerificationKeyData {
    pub alpha_g1: [u8; 64],
    pub beta_g2: [u8; 128],
    pub gamma_g2: [u8; 128],
    pub delta_g2: [u8; 128],
    pub ic: Vec<[u8; 64]>,
}
