/// Witness Validation Test Suite
/// Tests that witness mutations are caught by circuit constraints

use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::merkle::{compute_merkle_root, MerkleProof, verify_merkle_inclusion};
use crate::primitives::nullifier::compute_nullifier;

/// Commitment witness: owner field
#[test]
fn test_commitment_witness_owner_mutation() {
    let original_owner = 12345;
    let mutated_owner = 54321;
    let amount = 1000;
    let vault_id = 0;
    let blinding = 99999;

    let original_commitment = compute_commitment(
        Balance { owner: original_owner, amount, vault_id, blinding },
    );

    let mutated_commitment =
        compute_commitment(Balance { owner: mutated_owner, amount, vault_id, blinding });

    // Mutation must change commitment (constraint catches change)
    assert(original_commitment != mutated_commitment);
}

/// Commitment witness: amount field
#[test]
fn test_commitment_witness_amount_mutation() {
    let owner = 12345;
    let original_amount = 1000;
    let mutated_amount = 2000;
    let vault_id = 0;
    let blinding = 99999;

    let original_commitment = compute_commitment(
        Balance { owner, amount: original_amount, vault_id, blinding },
    );

    let mutated_commitment = compute_commitment(
        Balance { owner, amount: mutated_amount, vault_id, blinding },
    );

    // Mutation must change commitment
    assert(original_commitment != mutated_commitment);
}

/// Commitment witness: vault_id field
#[test]
fn test_commitment_witness_vault_id_mutation() {
    let owner = 12345;
    let amount = 1000;
    let original_vault_id = 0;
    let mutated_vault_id = 77777;
    let blinding = 99999;

    let original_commitment = compute_commitment(
        Balance { owner, amount, vault_id: original_vault_id, blinding },
    );

    let mutated_commitment = compute_commitment(
        Balance { owner, amount, vault_id: mutated_vault_id, blinding },
    );

    // Mutation must change commitment
    assert(original_commitment != mutated_commitment);
}

/// Commitment witness: blinding field
#[test]
fn test_commitment_witness_blinding_mutation() {
    let owner = 12345;
    let amount = 1000;
    let vault_id = 0;
    let original_blinding = 99999;
    let mutated_blinding = 88888;

    let original_commitment = compute_commitment(
        Balance { owner, amount, vault_id, blinding: original_blinding },
    );

    let mutated_commitment = compute_commitment(
        Balance { owner, amount, vault_id, blinding: mutated_blinding },
    );

    // Mutation must change commitment
    assert(original_commitment != mutated_commitment);
}

/// Nullifier witness: secret mutation
#[test]
fn test_nullifier_witness_secret_mutation() {
    let commitment = 12345;
    let original_secret = 67890;
    let mutated_secret = 11111;
    let nonce = 100;

    let original_nullifier = compute_nullifier(commitment, original_secret, nonce);
    let mutated_nullifier = compute_nullifier(commitment, mutated_secret, nonce);

    // Mutation must change nullifier (constraint catches)
    assert(original_nullifier != mutated_nullifier);
}

/// Nullifier witness: nonce mutation
#[test]
fn test_nullifier_witness_nonce_mutation() {
    let commitment = 12345;
    let secret = 67890;
    let original_nonce = 100;
    let mutated_nonce = 200;

    let original_nullifier = compute_nullifier(commitment, secret, original_nonce);
    let mutated_nullifier = compute_nullifier(commitment, secret, mutated_nonce);

    // Mutation must change nullifier
    assert(original_nullifier != mutated_nullifier);
}

/// Merkle proof witness: sibling mutation
#[test]
fn test_merkle_witness_sibling_mutation() {
    let leaf = 100;
    let original_sibling = 200;
    let mutated_sibling = 999;
    let path_indices = [0, 1, 0];

    let original_proof = MerkleProof { siblings: [original_sibling, 300, 400], path_indices };
    let mutated_proof = MerkleProof { siblings: [mutated_sibling, 300, 400], path_indices };

    let original_root = compute_merkle_root(leaf, original_proof);
    let mutated_root = compute_merkle_root(leaf, mutated_proof);

    // Sibling mutation must change root (constraint catches)
    assert(original_root != mutated_root);
}

/// Merkle proof witness: path_index mutation
#[test]
fn test_merkle_witness_path_index_mutation() {
    let leaf = 100;
    let siblings = [200, 300, 400];
    let original_indices = [0, 1, 0];
    let mutated_indices = [1, 1, 0]; // First index flipped
    let original_proof = MerkleProof { siblings, path_indices: original_indices };
    let mutated_proof = MerkleProof { siblings, path_indices: mutated_indices };

    let original_root = compute_merkle_root(leaf, original_proof);
    let mutated_root = compute_merkle_root(leaf, mutated_proof);

    // Path mutation must change root
    assert(original_root != mutated_root);
}

/// Merkle proof witness: leaf mutation
#[test]
fn test_merkle_witness_leaf_mutation() {
    let original_leaf = 100;
    let mutated_leaf = 200;
    let proof = MerkleProof { siblings: [300, 400, 500], path_indices: [0, 1, 0] };

    let original_root = compute_merkle_root(original_leaf, proof);
    let mutated_root = compute_merkle_root(mutated_leaf, proof);

    // Leaf mutation must change root
    assert(original_root != mutated_root);
}

/// Witness consistency: commitment uses all fields
#[test]
fn test_commitment_witness_consistency() {
    let balance = Balance { owner: 1, amount: 100, vault_id: 0, blinding: 1 };
    let commitment1 = compute_commitment(balance);

    // Create commitment with identical inputs
    let commitment2 = compute_commitment(balance);

    // Must be identical (consistency)
    assert(commitment1 == commitment2);

    // Change each field one at a time
    let mutated_owner = Balance { owner: 2, amount: 100, vault_id: 0, blinding: 1 };
    assert(compute_commitment(mutated_owner) != commitment1);

    let mutated_amount = Balance { owner: 1, amount: 101, vault_id: 0, blinding: 1 };
    assert(compute_commitment(mutated_amount) != commitment1);

    let mutated_vault = Balance { owner: 1, amount: 100, vault_id: 1, blinding: 1 };
    assert(compute_commitment(mutated_vault) != commitment1);

    let mutated_blinding = Balance { owner: 1, amount: 100, vault_id: 0, blinding: 2 };
    assert(compute_commitment(mutated_blinding) != commitment1);
}

/// Witness consistency: nullifier uses all fields
#[test]
fn test_nullifier_witness_consistency() {
    let commitment = 100;
    let secret = 200;
    let nonce = 300;

    let nullifier1 = compute_nullifier(commitment, secret, nonce);
    let nullifier2 = compute_nullifier(commitment, secret, nonce);

    // Must be identical (consistency)
    assert(nullifier1 == nullifier2);

    // Change each field
    assert(compute_nullifier(101, secret, nonce) != nullifier1);
    assert(compute_nullifier(commitment, 201, nonce) != nullifier1);
    assert(compute_nullifier(commitment, secret, 301) != nullifier1);
}

/// Witness mutations across operations
#[test]
fn test_witness_mutation_cascade() {
    let owner = 12345;
    let amount = 1000;
    let vault_id = 0;
    let blinding1 = 99999;

    // Original balance and commitment
    let balance = Balance { owner, amount, vault_id, blinding: blinding1 };
    let commitment = compute_commitment(balance);

    // Mutate blinding (represents new deposit/withdrawal)
    let blinding2 = 88888;
    let new_balance = Balance { owner, amount, vault_id, blinding: blinding2 };
    let new_commitment = compute_commitment(new_balance);

    assert(commitment != new_commitment);

    // Mutating commitment changes nullifier
    let nullifier1 = compute_nullifier(commitment, 11111, 0);
    let nullifier2 = compute_nullifier(new_commitment, 11111, 0);

    assert(nullifier1 != nullifier2);
}

/// Witness range constraint
#[test]
fn test_witness_range_check_constraint() {
    // Valid u64 amount
    let valid_amount: u64 = 1000;
    let field_amount = valid_amount as Field;
    let amount_back = field_amount as u64;

    // Range check passes
    assert(valid_amount == amount_back);

    // Max u64 value
    let max_amount: u64 = 18446744073709551615;
    let field_max = max_amount as Field;
    let max_back = field_max as u64;

    assert(max_amount == max_back);
}

/// Witness count verification
/// Verifies that multiple witnesses satisfy constraints
#[test]
fn test_witness_count_coverage() {
    // Deposit witnesses: 5 commitment fields
    let balances = [
        Balance { owner: 1, amount: 100, vault_id: 0, blinding: 1 },
        Balance { owner: 2, amount: 200, vault_id: 1, blinding: 2 },
        Balance { owner: 3, amount: 300, vault_id: 2, blinding: 3 },
        Balance { owner: 4, amount: 400, vault_id: 3, blinding: 4 },
        Balance { owner: 5, amount: 500, vault_id: 4, blinding: 5 },
    ];

    let mut commitments: [Field; 5] = [0; 5];
    for i in 0..5 {
        commitments[i] = compute_commitment(balances[i]);
    }

    // All commitments unique (each witness set produces distinct output)
    for i in 0..4 {
        for j in (i + 1)..5 {
            assert(commitments[i] != commitments[j]);
        }
    }
}

/// Witness validity verification across operations
#[test]
fn test_witness_operation_flow() {
    // Step 1: Deposit creates commitment
    let owner = 12345;
    let amount1 = 1000;
    let vault_id = 0;
    let blinding1 = 11111;

    let balance1 = Balance { owner, amount: amount1, vault_id, blinding: blinding1 };
    let commitment1 = compute_commitment(balance1);

    // Step 2: Merkle proof includes commitment
    let proof1 = MerkleProof { siblings: [100, 200, 300], path_indices: [0, 1, 0] };
    let root1 = compute_merkle_root(commitment1, proof1);

    assert(verify_merkle_inclusion(commitment1, root1, proof1));

    // Step 3: Nullifier uses commitment and secret
    let secret = 67890;
    let nonce = 111;
    let nullifier1 = compute_nullifier(commitment1, secret, nonce);

    // Step 4: Partial transfer - new commitment
    let amount2 = 700; // Remainder from 1000 - 300
    let blinding2 = 22222;

    let balance2 = Balance { owner, amount: amount2, vault_id, blinding: blinding2 };
    let commitment2 = compute_commitment(balance2);

    assert(commitment1 != commitment2);

    // Step 5: Nullifier for new commitment
    let nullifier2 = compute_nullifier(commitment2, secret, nonce);

    assert(nullifier1 != nullifier2);
}

/// Witness field constraints
#[test]
fn test_witness_field_constraints() {
    let owner = 12345;
    let amount = 1000;
    let vault_id = 0;
    let blinding = 99999;

    let balance = Balance { owner, amount, vault_id, blinding };

    // Commitment is deterministic from witness
    let c1 = compute_commitment(balance);
    let c2 = compute_commitment(balance);
    assert(c1 == c2);

    // Every field in witness affects commitment
    let variants = [
        Balance { owner: owner + 1, amount, vault_id, blinding },
        Balance { owner, amount: amount + 1, vault_id, blinding },
        Balance { owner, amount, vault_id: vault_id + 1, blinding },
        Balance { owner, amount, vault_id, blinding: blinding + 1 },
    ];

    for i in 0..4 {
        let variant_commitment = compute_commitment(variants[i]);
        assert(variant_commitment != c1);
    }
}
