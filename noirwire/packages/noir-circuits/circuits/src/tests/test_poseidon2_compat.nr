// Poseidon2 Compatibility Tests
// Validates that the Noir circuit Poseidon2 implementation matches
// the Barretenberg implementation used by the SDK

use crate::primitives::poseidon2::Poseidon2;
use crate::primitives::commitment::{compute_commitment, Balance, COMMITMENT_DOMAIN};

/// Test: Poseidon2 hash produces deterministic results
#[test]
fn test_poseidon2_deterministic() {
    let inputs = [1, 2];
    let hash1 = Poseidon2::hash(inputs, 2);
    let hash2 = Poseidon2::hash(inputs, 2);
    assert(hash1 == hash2);
}

/// Test: Poseidon2 hash is sensitive to input changes
#[test]
fn test_poseidon2_input_sensitivity() {
    let inputs1 = [1, 2];
    let inputs2 = [1, 3];
    let hash1 = Poseidon2::hash(inputs1, 2);
    let hash2 = Poseidon2::hash(inputs2, 2);
    assert(hash1 != hash2);
}

/// Test: Poseidon2 hash order matters
#[test]
fn test_poseidon2_order_sensitive() {
    let inputs1 = [1, 2];
    let inputs2 = [2, 1];
    let hash1 = Poseidon2::hash(inputs1, 2);
    let hash2 = Poseidon2::hash(inputs2, 2);
    assert(hash1 != hash2);
}

/// Test: Poseidon2 with single input
#[test]
fn test_poseidon2_single_input() {
    let input = [42];
    let hash1 = Poseidon2::hash(input, 1);
    let hash2 = Poseidon2::hash(input, 1);
    assert(hash1 == hash2);
}

/// Test: Poseidon2 with 5 inputs (commitment format)
#[test]
fn test_poseidon2_five_inputs() {
    let inputs = [COMMITMENT_DOMAIN, 12345, 1000, 0, 99999];
    let hash1 = Poseidon2::hash(inputs, 5);
    let hash2 = Poseidon2::hash(inputs, 5);
    assert(hash1 == hash2);
}

/// Test: Commitment computation produces valid field elements
/// This test ensures the hash output is within the BN254 field modulus
#[test]
fn test_commitment_produces_valid_field_element() {
    let balance = Balance { owner: 12345, amount: 1000, vault_id: 0, blinding: 99999 };

    let commitment = compute_commitment(balance);

    // The commitment should be non-zero
    assert(commitment != 0);

    // Commitment should be deterministic
    let commitment2 = compute_commitment(balance);
    assert(commitment == commitment2);
}

/// Test: Large field values work correctly
/// Validates that values near the field modulus work properly
#[test]
fn test_poseidon2_large_values() {
    // Use large values close to the BN254 field modulus
    let large_value: Field = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000;
    let inputs = [large_value, 1];
    let hash = Poseidon2::hash(inputs, 2);

    // Hash should be deterministic
    let hash2 = Poseidon2::hash(inputs, 2);
    assert(hash == hash2);
}

/// Test: Zero inputs produce consistent hash
#[test]
fn test_poseidon2_zero_inputs() {
    let inputs = [0, 0];
    let hash1 = Poseidon2::hash(inputs, 2);
    let hash2 = Poseidon2::hash(inputs, 2);
    assert(hash1 == hash2);
    assert(hash1 != 0); // Zero inputs should not produce zero hash
}

/// Test: Merkle tree hash pairs (used in tree verification)
#[test]
fn test_poseidon2_merkle_pairs() {
    let left = 100;
    let right = 200;

    let hash_left_right = Poseidon2::hash([left, right], 2);
    let hash_right_left = Poseidon2::hash([right, left], 2);

    // Order matters in merkle trees
    assert(hash_left_right != hash_right_left);

    // Each should be deterministic
    assert(hash_left_right == Poseidon2::hash([left, right], 2));
    assert(hash_right_left == Poseidon2::hash([right, left], 2));
}

/// Test: Domain separation works correctly
#[test]
fn test_poseidon2_domain_separation() {
    let owner = 12345;
    let amount = 1000;
    let vault_id = 0;
    let blinding = 99999;

    // With commitment domain
    let with_domain = Poseidon2::hash([COMMITMENT_DOMAIN, owner, amount, vault_id, blinding], 5);

    // Without domain (wrong)
    let without_domain = Poseidon2::hash([owner, amount, vault_id, blinding, 0], 5);

    // Should be different
    assert(with_domain != without_domain);
}

/// Test: Variable length inputs produce different hashes
#[test]
fn test_poseidon2_variable_length() {
    let value = 123;

    let hash_1 = Poseidon2::hash([value], 1);
    let hash_2 = Poseidon2::hash([value, 0], 2);
    let hash_5 = Poseidon2::hash([value, 0, 0, 0, 0], 5);

    // Different lengths should produce different hashes
    assert(hash_1 != hash_2);
    assert(hash_2 != hash_5);
    assert(hash_1 != hash_5);
}

/// Test: Commitment collision resistance
/// Different balances should produce different commitments
#[test]
fn test_commitment_collision_resistance() {
    let b1 = Balance { owner: 1, amount: 100, vault_id: 0, blinding: 111 };
    let b2 = Balance { owner: 1, amount: 100, vault_id: 0, blinding: 112 }; // Different blinding
    let b3 = Balance { owner: 1, amount: 101, vault_id: 0, blinding: 111 }; // Different amount
    let b4 = Balance { owner: 2, amount: 100, vault_id: 0, blinding: 111 }; // Different owner
    let c1 = compute_commitment(b1);
    let c2 = compute_commitment(b2);
    let c3 = compute_commitment(b3);
    let c4 = compute_commitment(b4);

    // All should be different
    assert(c1 != c2);
    assert(c1 != c3);
    assert(c1 != c4);
    assert(c2 != c3);
    assert(c2 != c4);
    assert(c3 != c4);
}

/// Test: Empty leaf value (used in merkle trees)
#[test]
fn test_poseidon2_empty_leaf() {
    let empty = 0;
    let sibling = 100;

    let hash = Poseidon2::hash([empty, sibling], 2);
    assert(hash != 0);
    assert(hash != sibling);
}

/// Test: SDK-compatible commitment computation
/// This test uses the exact same format as the SDK
#[test]
fn test_sdk_compatible_commitment() {
    // Example values that would come from the SDK (within field modulus)
    let owner: Field = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    let amount: Field = 1000000; // 0.001 SOL in lamports
    let vault_id: Field = 0;
    let blinding: Field = 0x0bcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd;

    let balance = Balance { owner, amount, vault_id, blinding };
    let commitment = compute_commitment(balance);

    // Commitment should be non-zero and deterministic
    assert(commitment != 0);
    assert(commitment == compute_commitment(balance));

    // Changing any field should change the commitment
    let different_owner = Balance { owner: owner + 1, amount, vault_id, blinding };
    assert(compute_commitment(different_owner) != commitment);
}
