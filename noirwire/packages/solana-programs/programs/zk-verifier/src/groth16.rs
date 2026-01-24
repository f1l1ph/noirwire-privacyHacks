use anchor_lang::prelude::*;
// TODO: alt_bn128 module not available in current solana-program version
// Need to investigate alternative BN254 curve operations
// use anchor_lang::solana_program::alt_bn128;
use crate::errors::VerifierError;

/// Groth16 proof structure (BN254 curve)
/// Points are in compressed format
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Groth16Proof {
    /// A point (G1) - 64 bytes compressed
    pub a: [u8; 64],
    /// B point (G2) - 128 bytes compressed
    pub b: [u8; 128],
    /// C point (G1) - 64 bytes compressed
    pub c: [u8; 64],
}

/// Verify a Groth16 proof using Solana's alt_bn128 syscalls
///
/// The verification equation is:
/// e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
///
/// Which we check as:
/// e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
pub fn verify_proof(
    alpha_g1: &[u8; 64],
    beta_g2: &[u8; 128],
    gamma_g2: &[u8; 128],
    delta_g2: &[u8; 128],
    ic: &[[u8; 64]],
    proof: &Groth16Proof,
    public_inputs: &[[u8; 32]],
) -> Result<bool> {
    // 1. Check input count matches IC count
    require!(
        public_inputs.len() + 1 == ic.len(),
        VerifierError::InputCountMismatch
    );

    // 2. Compute vk_x = IC[0] + sum(input[i] * IC[i+1])
    //    This accumulates the public inputs into a single G1 point
    let mut vk_x = ic[0].to_vec();

    for (i, input) in public_inputs.iter().enumerate() {
        // Scalar multiplication: input[i] * IC[i+1]
        let scaled = alt_bn128_multiplication(&ic[i + 1], input)?;
        // Point addition: vk_x += scaled
        vk_x = alt_bn128_addition(&vk_x, &scaled)?;
    }

    // 3. Negate proof.A for pairing check
    let neg_a = negate_g1(&proof.a)?;

    // 4. Build pairing input (4 pairs for Groth16)
    // Verification: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
    let mut pairing_input = Vec::with_capacity(4 * (64 + 128));

    // Pair 1: e(-A, B) - negated proof point A with B
    pairing_input.extend_from_slice(&neg_a);
    pairing_input.extend_from_slice(&proof.b);

    // Pair 2: e(alpha, beta) - from verification key
    pairing_input.extend_from_slice(alpha_g1);
    pairing_input.extend_from_slice(beta_g2);

    // Pair 3: e(vk_x, gamma) - accumulated public inputs with gamma
    pairing_input.extend_from_slice(&vk_x);
    pairing_input.extend_from_slice(gamma_g2);

    // Pair 4: e(C, delta) - proof point C with delta
    pairing_input.extend_from_slice(&proof.c);
    pairing_input.extend_from_slice(delta_g2);

    // 5. Execute pairing check via syscall
    let result = alt_bn128_pairing(&pairing_input)?;

    // Result is 32 bytes: 0x000...001 if pairing check passes
    Ok(result[31] == 1 && result[..31].iter().all(|&b| b == 0))
}

/// Wrapper for alt_bn128 addition syscall
fn alt_bn128_addition(_p1: &[u8], _p2: &[u8]) -> Result<Vec<u8>> {
    // TODO: Implement BN254 addition using available syscalls or library
    // alt_bn128 module not available in current Solana version
    err!(VerifierError::Bn128Error)
}

/// Wrapper for alt_bn128 multiplication syscall
fn alt_bn128_multiplication(_point: &[u8], _scalar: &[u8; 32]) -> Result<Vec<u8>> {
    // TODO: Implement BN254 multiplication using available syscalls or library
    err!(VerifierError::Bn128Error)
}

/// Wrapper for alt_bn128 pairing syscall
fn alt_bn128_pairing(_input: &[u8]) -> Result<Vec<u8>> {
    // TODO: Implement BN254 pairing using available syscalls or library
    err!(VerifierError::PairingFailed)
}

/// Negate G1 point (flip y-coordinate in Fp)
/// For BN254: -P = (x, p - y) where p is the field modulus
///
/// **Production Implementation** using num-bigint for correct modular arithmetic
fn negate_g1(point: &[u8; 64]) -> Result<[u8; 64]> {
    use num_bigint::BigUint;
    use num_traits::Num;

    // BN254 field modulus p
    // p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
    let p = BigUint::from_str_radix(
        "30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47",
        16
    ).map_err(|_| error!(VerifierError::Bn128Error))?;

    let mut result = *point;

    // x coordinate stays the same (first 32 bytes)
    // Negate y coordinate: y' = p - y (second 32 bytes)
    let y = BigUint::from_bytes_be(&point[32..64]);
    let neg_y = (&p - y) % &p;

    // Convert back to bytes (big-endian, padded to 32 bytes)
    let neg_y_bytes = neg_y.to_bytes_be();
    let padding = 32 - neg_y_bytes.len();
    result[32..32+padding].fill(0);
    result[32+padding..64].copy_from_slice(&neg_y_bytes);

    Ok(result)
}
