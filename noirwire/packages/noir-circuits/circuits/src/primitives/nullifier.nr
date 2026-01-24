use crate::primitives::poseidon2::Poseidon2;

/// Domain separator for nullifiers (prevents hash collision attacks)
pub global NULLIFIER_DOMAIN: Field = 0x02;

/// Compute a nullifier for a commitment
/// nullifier = H(domain || commitment || secret_key || nonce)
///
/// Properties:
/// - Deterministic: same inputs always produce same nullifier
/// - Unlinkable: can't derive commitment from nullifier
/// - Unique: each commitment can only be spent once
pub fn compute_nullifier(commitment: Field, secret_key: Field, nonce: Field) -> Field {
    Poseidon2::hash([NULLIFIER_DOMAIN, commitment, secret_key, nonce], 4)
}

/// Verify a nullifier is correctly computed
pub fn verify_nullifier(
    nullifier: Field,
    commitment: Field,
    secret_key: Field,
    nonce: Field,
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

#[test]
fn test_nullifier_input_permutation_changes_output() {
    let commitment = 1111;
    let secret_key = 2222;
    let nonce = 3333;

    let baseline = compute_nullifier(commitment, secret_key, nonce);
    let swapped = compute_nullifier(secret_key, commitment, nonce);
    assert(baseline != swapped);
}

#[test]
fn test_nullifier_wrong_domain_rejected() {
    let commitment = 42;
    let secret_key = 43;
    let nonce = 44;

    let good = compute_nullifier(commitment, secret_key, nonce);
    // Simulate tampered domain separator
    let tampered = Poseidon2::hash([0xFF, commitment, secret_key, nonce], 4);
    assert(good != tampered);
    assert(!verify_nullifier(tampered, commitment, secret_key, nonce));
}
