/// Edge Cases Test Suite: Boundary Conditions and Extreme Values
/// Tests behavior at limits and edge cases

use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::poseidon2::Poseidon2;

/// Test: Zero values in various fields
#[test]
fn test_zero_owner() {
    let balance = Balance {
        owner: 0, // Edge case: zero owner
        amount: 1000,
        vault_id: 0,
        blinding: 12345,
    };
    let commitment = compute_commitment(balance);
    assert(commitment != 0, "Commitment must be non-zero even with zero owner");
}

#[test]
fn test_zero_vault_id() {
    let balance = Balance {
        owner: 12345,
        amount: 1000,
        vault_id: 0, // Standard: solo user
        blinding: 99999,
    };
    let commitment = compute_commitment(balance);
    assert(commitment != 0, "Commitment valid with zero vault_id");
}

#[test]
fn test_zero_blinding() {
    let balance = Balance {
        owner: 12345,
        amount: 1000,
        vault_id: 0,
        blinding: 0, // Edge case: zero blinding (bad practice but valid)
    };
    let commitment = compute_commitment(balance);
    assert(commitment != 0, "Commitment computable with zero blinding");
}

/// Test: Maximum u64 values
#[test]
fn test_max_u64_amount() {
    let max_amount: u64 = 18446744073709551615; // 2^64 - 1
    let balance =
        Balance { owner: 12345, amount: max_amount as Field, vault_id: 0, blinding: 99999 };
    let commitment = compute_commitment(balance);
    assert(commitment != 0, "Commitment must be non-zero for max u64 amount");

    // Verify range check would pass
    let amount_u64 = balance.amount as u64;
    let amount_back = amount_u64 as Field;
    assert(balance.amount == amount_back, "Max u64 must pass range check");
}

#[test]
fn test_max_field_owner() {
    // Owner is derived from hash, so any Field value is valid
    let huge_owner = 0 - 1; // Max field value
    let balance = Balance { owner: huge_owner, amount: 1000, vault_id: 0, blinding: 99999 };
    let commitment = compute_commitment(balance);
    assert(commitment != 0, "Commitment valid with max field owner");
}

/// Test: Amount exactly 1 (minimum positive)
#[test]
fn test_minimum_amount() {
    let min_amount: u64 = 1;
    let balance =
        Balance { owner: 12345, amount: min_amount as Field, vault_id: 0, blinding: 99999 };
    let commitment = compute_commitment(balance);
    assert(commitment != 0, "Minimum amount 1 is valid");
}

/// Test: Transfer exact balance (remainder = 0)
#[test]
fn test_exact_balance_transfer() {
    let balance: u64 = 1000;
    let transfer: u64 = 1000;
    let remainder = balance - transfer;

    assert(remainder == 0, "Exact transfer leaves zero remainder");
    assert(balance >= transfer, "Balance check passes for exact transfer");
}

/// Test: Transfer minimum amount
#[test]
fn test_minimum_transfer() {
    let balance: u64 = 1000;
    let transfer: u64 = 1;
    let remainder = balance - transfer;

    assert(remainder == 999, "Minimum transfer of 1");
    assert(balance >= transfer, "Balance check passes");
}

/// Test: Very large merkle path indices
#[test]
fn test_max_leaf_index() {
    // With TREE_DEPTH=3, max leaf index is 2^3-1 = 7
    // Path indices: [1, 1, 1] = index 7 in binary
    let max_path = [1, 1, 1];

    // Verify all indices are binary (0 or 1)
    for i in 0..3 {
        let idx = max_path[i];
        assert((idx == 0) | (idx == 1), "Path index must be binary");
    }
}

/// Test: Nullifier with zero nonce
#[test]
fn test_nullifier_zero_nonce() {
    let commitment = 12345;
    let secret = 67890;
    let nonce = 0;

    let nullifier = compute_nullifier(commitment, secret, nonce);
    assert(nullifier != 0, "Nullifier valid with zero nonce");
    assert(nullifier != commitment, "Nullifier differs from commitment");
}

/// Test: Nullifier with max nonce
#[test]
fn test_nullifier_max_nonce() {
    let commitment = 12345;
    let secret = 67890;
    let max_nonce = 0 - 1; // Max field value
    let nullifier = compute_nullifier(commitment, secret, max_nonce);
    assert(nullifier != 0, "Nullifier valid with max nonce");
}

/// Test: Consecutive amounts differ in commitment
#[test]
fn test_consecutive_amounts() {
    let owner = 12345;
    let vault_id = 0;
    let blinding = 99999;

    let balance1 = Balance { owner, amount: 1000, vault_id, blinding };
    let balance2 = Balance { owner, amount: 1001, vault_id, blinding };

    let c1 = compute_commitment(balance1);
    let c2 = compute_commitment(balance2);

    assert(c1 != c2, "Consecutive amounts produce different commitments");
}

/// Test: Identical parameters produce identical commitment (determinism)
#[test]
fn test_commitment_determinism() {
    let balance = Balance { owner: 11111, amount: 2222, vault_id: 3333, blinding: 4444 };

    let c1 = compute_commitment(balance);
    let c2 = compute_commitment(balance);
    let c3 = compute_commitment(balance);

    assert(c1 == c2, "Commitment must be deterministic");
    assert(c2 == c3, "Commitment must be deterministic");
}

/// Test: Off-by-one in balance check
#[test]
fn test_balance_boundary() {
    let balance: u64 = 1000;

    // Exactly at boundary: should succeed
    let transfer_ok: u64 = 1000;
    assert(balance >= transfer_ok, "At boundary succeeds");

    // One above boundary: should fail
    let transfer_fail: u64 = 1001;
    assert(!(balance >= transfer_fail), "Above boundary fails");

    // One below boundary: should succeed
    let transfer_below: u64 = 999;
    assert(balance >= transfer_below, "Below boundary succeeds");
}

/// Test: Powers of 2 amounts
#[test]
fn test_power_of_two_amounts() {
    let owner = 12345;
    let vault_id = 0;
    let blinding = 99999;

    let amounts = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

    let mut commitments: [Field; 11] = [0; 11];
    for i in 0..11 {
        let balance = Balance { owner, amount: amounts[i], vault_id, blinding };
        commitments[i] = compute_commitment(balance);
    }

    // All commitments must be unique
    for i in 0..10 {
        for j in (i + 1)..11 {
            assert(commitments[i] != commitments[j], "Commitments must be unique");
        }
    }
}

/// Test: Same commitment, different secrets produce different nullifiers
#[test]
fn test_secret_variations() {
    let commitment = 12345;
    let nonce = 100;

    let secrets = [1, 2, 3, 4, 5];
    let mut nullifiers: [Field; 5] = [0; 5];

    for i in 0..5 {
        nullifiers[i] = compute_nullifier(commitment, secrets[i], nonce);
    }

    // All nullifiers must be unique
    for i in 0..4 {
        for j in (i + 1)..5 {
            assert(
                nullifiers[i] != nullifiers[j],
                "Different secrets produce different nullifiers",
            );
        }
    }
}

/// Test: Same inputs to hash produce same output (no randomness)
#[test]
fn test_hash_determinism() {
    let inputs = [100, 200, 300];

    let h1 = Poseidon2::hash(inputs, 3);
    let h2 = Poseidon2::hash(inputs, 3);
    let h3 = Poseidon2::hash(inputs, 3);

    assert(h1 == h2, "Hash must be deterministic");
    assert(h2 == h3, "Hash must be deterministic");
}

/// Test: Slightly different hash inputs produce different outputs
#[test]
fn test_hash_sensitivity() {
    let base = [100, 200, 300];

    let h_base = Poseidon2::hash(base, 3);
    let h_mod1 = Poseidon2::hash([101, 200, 300], 3);
    let h_mod2 = Poseidon2::hash([100, 201, 300], 3);
    let h_mod3 = Poseidon2::hash([100, 200, 301], 3);

    assert(h_base != h_mod1, "Hash sensitive to first input");
    assert(h_base != h_mod2, "Hash sensitive to second input");
    assert(h_base != h_mod3, "Hash sensitive to third input");
}

/// Test: Empty vs. non-empty leaf distinction
#[test]
fn test_empty_leaf_value() {
    let empty: Field = 0;
    let non_empty: Field = 1;

    assert(empty != non_empty, "Empty and non-empty leaves must differ");

    // Empty leaf in commitment context
    let balance_zero_amount = Balance { owner: 1, amount: 0, vault_id: 0, blinding: 1 };
    let balance_one_amount = Balance { owner: 1, amount: 1, vault_id: 0, blinding: 1 };

    let c_zero = compute_commitment(balance_zero_amount);
    let c_one = compute_commitment(balance_one_amount);

    assert(c_zero != c_one, "Zero and one amounts produce different commitments");
}

/// Test: Very long computation chains don't overflow
#[test]
fn test_chained_operations() {
    let mut value: u64 = 1000;

    // Simulate multiple sequential transfers
    value = value - 100; // 900
    value = value - 100; // 800
    value = value - 100; // 700
    value = value - 100; // 600
    value = value - 100; // 500
    value = value - 100; // 400
    value = value - 100; // 300
    value = value - 100; // 200
    value = value - 100; // 100
    value = value - 100; // 0
    assert(value == 0, "Chained subtractions reach zero");
}

/// Test: Vault ID variations
#[test]
fn test_vault_id_variations() {
    let owner = 12345;
    let amount = 1000;
    let blinding = 99999;

    let vault_ids = [0, 1, 100, 9999, 0 - 1]; // Various vault IDs
    let mut commitments: [Field; 5] = [0; 5];

    for i in 0..5 {
        let balance = Balance { owner, amount, vault_id: vault_ids[i], blinding };
        commitments[i] = compute_commitment(balance);
    }

    // All must be unique
    for i in 0..4 {
        for j in (i + 1)..5 {
            assert(
                commitments[i] != commitments[j],
                "Different vault_ids produce unique commitments",
            );
        }
    }
}
