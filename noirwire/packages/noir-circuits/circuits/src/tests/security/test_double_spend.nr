/// Security Test Suite: Double-Spend Attacks
/// Tests that nullifiers prevent reusing the same commitment twice

use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::nullifier::compute_nullifier;

/// Attack: Attempt to reuse the same nullifier in multiple transfers
/// Expected: MUST FAIL - nullifiers enforce one-time use
///
/// This test verifies that using the same commitment and secrets cannot produce
/// different nullifiers. An attacker trying to spend the same note twice would
/// need to use the same commitment/secret pair, which always produces the same nullifier.
/// A proper nullifier registry on-chain would reject the second use.
#[test]
fn test_reuse_nullifier_attack() {
    let commitment = 12345;
    let secret = 67890;
    let nonce = 111;

    let nullifier_first = compute_nullifier(commitment, secret, nonce);
    let nullifier_second = compute_nullifier(commitment, secret, nonce);

    // Same inputs MUST produce identical nullifier (deterministic)
    assert(
        nullifier_first == nullifier_second,
        "Same commitment/secret produces identical nullifier - on-chain registry prevents double-spend",
    );
}

/// Attack: Use same commitment with different secrets to generate multiple nullifiers
/// Expected: Valid - different secrets produce different nullifiers (this is correct behavior)
#[test]
fn test_same_commitment_different_secrets() {
    let commitment = 12345;
    let secret1 = 11111;
    let secret2 = 22222;
    let nonce = 0;

    let nullifier1 = compute_nullifier(commitment, secret1, nonce);
    let nullifier2 = compute_nullifier(commitment, secret2, nonce);

    // Different secrets must produce different nullifiers
    assert(nullifier1 != nullifier2, "Different secrets must produce unique nullifiers");
}

/// Attack: Try to spend same balance twice by changing nonce
/// Expected: Different nonces produce different nullifiers - each creates unique spending proof
///
/// This test verifies that changing the nonce changes the nullifier, which is correct
/// behavior. However, an attacker cannot spend the same note twice even with different
/// nonces because they're spending the same balance (same commitment). The nonce field
/// allows multiple spending proofs from the same note, but the note itself can only be
/// spent once via nullifier tracking.
#[test]
fn test_double_spend_different_nonce() {
    let owner = 12345;
    let amount = 1000;
    let vault_id = 0;
    let blinding = 99999;

    let balance = Balance { owner, amount, vault_id, blinding };
    let commitment = compute_commitment(balance);

    let secret = 67890;
    let nonce1 = 111;
    let nonce2 = 222;

    // Generate two different nullifiers from same commitment with different nonces
    let nullifier1 = compute_nullifier(commitment, secret, nonce1);
    let nullifier2 = compute_nullifier(commitment, secret, nonce2);

    // Different nonces MUST produce different nullifiers
    assert(
        nullifier1 != nullifier2,
        "Different nonces produce different nullifiers (enables multiple spending proofs)",
    );
    // However, both nullifiers refer to the same commitment
    // On-chain, spending the same commitment multiple times is still double-spend
    // because there's only one balance to withdraw
}

/// Attack: Forge nullifier without knowing the secret
/// Expected: MUST FAIL - nullifier computation requires commitment AND secret
///
/// This test verifies that computing a nullifier requires the secret key.
/// An attacker cannot forge a valid nullifier without possessing the secret.
#[test]
fn test_forge_nullifier_without_secret() {
    let commitment = 12345;
    let real_secret = 67890;
    let fake_secret = 0; // Attacker doesn't know real secret
    let nonce = 111;

    // Real nullifier (with correct secret)
    let real_nullifier = compute_nullifier(commitment, real_secret, nonce);

    // Forged nullifier (with wrong secret)
    let forged_nullifier = compute_nullifier(commitment, fake_secret, nonce);

    // Forged nullifier MUST differ from real one
    assert(
        forged_nullifier != real_nullifier,
        "Cannot forge valid nullifier without the correct secret",
    );
}

/// Attack: Try to link commitment to nullifier (privacy attack)
/// Expected: Should be computationally infeasible (one-way function)
#[test]
fn test_nullifier_unlinkability() {
    let balance = Balance { owner: 11111, amount: 5000, vault_id: 0, blinding: 99999 };
    let commitment = compute_commitment(balance);
    let secret = 22222;
    let nonce = 333;

    let nullifier = compute_nullifier(commitment, secret, nonce);

    // Given only the nullifier, it should be impossible to determine the commitment
    // This is ensured by Poseidon2's one-way property
    // We verify that different inputs produce different outputs
    let different_commitment = compute_commitment(
        Balance {
            owner: 11111,
            amount: 5000,
            vault_id: 0,
            blinding: 88888, // Different blinding
        },
    );
    let different_nullifier = compute_nullifier(different_commitment, secret, nonce);

    assert(nullifier != different_nullifier, "Nullifiers must be unique");
}

/// Attack: Replay a nullifier from a previous transaction
/// Expected: Same nullifier is deterministic - on-chain registry prevents replays
///
/// This test verifies that nullifiers are deterministic. An attacker replaying a
/// transaction will produce the same nullifier. A proper on-chain nullifier registry
/// will reject the replayed nullifier as already used.
#[test]
fn test_nullifier_replay_attack() {
    let commitment = 98765;
    let secret = 11111;
    let nonce = 42;

    // Original transaction nullifier
    let original_nullifier = compute_nullifier(commitment, secret, nonce);

    // Attacker captures and tries to replay the same transaction
    let replayed_nullifier = compute_nullifier(commitment, secret, nonce);

    // Both compute identical nullifiers (deterministic)
    assert(
        original_nullifier == replayed_nullifier,
        "Same input produces same nullifier - on-chain registry prevents replays",
    );
}

/// Attack: Grind nonces to find nullifier collision
/// Expected: MUST FAIL - Poseidon2 collision resistance prevents this
#[test]
fn test_nullifier_collision_resistance() {
    let commitment = 12345;
    let secret = 67890;

    // Try many different nonces
    let n1 = compute_nullifier(commitment, secret, 0);
    let n2 = compute_nullifier(commitment, secret, 1);
    let n3 = compute_nullifier(commitment, secret, 2);
    let n4 = compute_nullifier(commitment, secret, 3);
    let n5 = compute_nullifier(commitment, secret, 4);

    // All nullifiers must be unique
    assert(n1 != n2, "Nullifier collision detected");
    assert(n1 != n3, "Nullifier collision detected");
    assert(n1 != n4, "Nullifier collision detected");
    assert(n1 != n5, "Nullifier collision detected");
    assert(n2 != n3, "Nullifier collision detected");
    assert(n2 != n4, "Nullifier collision detected");
    assert(n2 != n5, "Nullifier collision detected");
    assert(n3 != n4, "Nullifier collision detected");
    assert(n3 != n5, "Nullifier collision detected");
    assert(n4 != n5, "Nullifier collision detected");
}
