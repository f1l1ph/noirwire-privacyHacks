use std::hash::poseidon2::Poseidon2;

/// Compute a nullifier for a commitment
/// nullifier = H(commitment, secret_key, nonce)
///
/// Properties:
/// - Deterministic: same inputs always produce same nullifier
/// - Unlinkable: can't derive commitment from nullifier
/// - Unique: each commitment can only be spent once
pub fn compute_nullifier(
    commitment: Field,
    secret_key: Field,
    nonce: Field
) -> Field {
    Poseidon2::hash([commitment, secret_key, nonce], 3)
}

/// Verify a nullifier is correctly computed
pub fn verify_nullifier(
    nullifier: Field,
    commitment: Field,
    secret_key: Field,
    nonce: Field
) -> bool {
    let computed = compute_nullifier(commitment, secret_key, nonce);
    computed == nullifier
}

#[test]
fn test_nullifier() {
    let commitment = 12345;
    let secret_key = 67890;
    let nonce = 111;

    let nullifier = compute_nullifier(commitment, secret_key, nonce);
    assert(verify_nullifier(nullifier, commitment, secret_key, nonce));

    // Different nonce should produce different nullifier
    let nullifier2 = compute_nullifier(commitment, secret_key, 222);
    assert(nullifier != nullifier2);
}
