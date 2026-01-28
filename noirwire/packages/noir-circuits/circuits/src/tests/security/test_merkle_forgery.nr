/// Security Test Suite: Merkle Proof Forgery Attacks
/// Tests that invalid merkle proofs are rejected

use crate::primitives::merkle::{
    verify_merkle_inclusion, verify_merkle_update, compute_merkle_root, MerkleProof, TREE_DEPTH,
};
use crate::primitives::poseidon2::Poseidon2;

/// Attack: Use wrong sibling values in merkle proof
/// Expected: MUST FAIL - verification rejects invalid proof
#[test(should_fail)]
fn test_wrong_siblings_attack() {
    let leaf = 100;

    // Correct proof
    let correct_siblings = [200, 300, 400];
    let path_indices = [0, 1, 0];
    let correct_proof = MerkleProof { siblings: correct_siblings, path_indices };
    let correct_root = compute_merkle_root(leaf, correct_proof);

    // Attacker tampers with siblings
    let tampered_siblings = [999, 300, 400]; // Changed first sibling
    let tampered_proof = MerkleProof { siblings: tampered_siblings, path_indices };

    // Verification must fail with tampered proof
    assert(
        verify_merkle_inclusion(leaf, correct_root, tampered_proof),
        "Tampered siblings must fail verification",
    );
}

/// Attack: Use wrong path indices to claim leaf is at different position
/// Expected: MUST FAIL - path indices must match actual position
#[test(should_fail)]
fn test_wrong_path_indices_attack() {
    let leaf = 100;
    let siblings = [200, 300, 400];

    // Correct path: left, right, left (0, 1, 0)
    let correct_proof = MerkleProof { siblings, path_indices: [0, 1, 0] };
    let correct_root = compute_merkle_root(leaf, correct_proof);

    // Attacker uses wrong path: right, right, left (1, 1, 0)
    let wrong_path_proof = MerkleProof {
        siblings,
        path_indices: [1, 1, 0], // Changed first index
    };

    // Verification must fail
    assert(
        verify_merkle_inclusion(leaf, correct_root, wrong_path_proof),
        "Wrong path indices must fail verification",
    );
}

/// Attack: Claim non-existent leaf is in tree
/// Expected: MUST FAIL - root won't match
#[test(should_fail)]
fn test_fake_leaf_inclusion_attack() {
    // Build tree with real leaf
    let real_leaf = 100;
    let siblings = [200, 300, 400];
    let path_indices = [0, 1, 0];
    let proof = MerkleProof { siblings, path_indices };
    let real_root = compute_merkle_root(real_leaf, proof);

    // Attacker tries to prove fake leaf is in tree
    let fake_leaf = 999;

    // Verification must fail
    assert(
        verify_merkle_inclusion(fake_leaf, real_root, proof),
        "Fake leaf cannot be proven to exist in tree",
    );
}

/// Attack: Reuse proof from different tree
/// Expected: MUST FAIL - proof is bound to specific root
#[test(should_fail)]
fn test_cross_tree_proof_reuse() {
    // Tree 1
    let leaf1 = 100;
    let proof1 = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let root1 = compute_merkle_root(leaf1, proof1);

    // Tree 2 (different structure)
    let leaf2 = 100; // Same leaf value
    let proof2 = MerkleProof {
        siblings: [500, 600, 700], // Different siblings
        path_indices: [0, 1, 0],
    };
    let root2 = compute_merkle_root(leaf2, proof2);
    assert(root1 != root2, "Different tree structures must produce different roots");

    // Attacker tries to use proof from tree1 to verify against root2
    assert(
        verify_merkle_inclusion(leaf1, root2, proof1),
        "Cannot reuse proof across different trees",
    );
}

/// Attack: Swap old and new leaves in update proof
/// Expected: MUST FAIL - update direction matters
#[test(should_fail)]
fn test_reversed_update_attack() {
    let old_leaf = 100;
    let new_leaf = 200;
    let leaf_index = 0;

    let proof = MerkleProof { siblings: [300, 400, 500], path_indices: [0, 1, 0] };

    let old_root = compute_merkle_root(old_leaf, proof);
    let new_root = compute_merkle_root(new_leaf, proof);

    // Attacker tries to reverse the update (new -> old instead of old -> new)
    assert(
        verify_merkle_update(new_leaf, old_leaf, leaf_index, old_root, new_root, proof),
        "Cannot reverse update direction",
    );
}

/// Attack: Use proof with invalid path index values (not 0 or 1)
/// Expected: MUST FAIL - path indices constrained to binary
#[test(should_fail)]
fn test_invalid_path_index_values() {
    let leaf = 100;

    // Invalid path indices (should only be 0 or 1)
    let invalid_proof = MerkleProof {
        siblings: [200, 300, 400],
        path_indices: [2, 1, 0], // 2 is invalid
    };

    // This should fail constraint that path_indices are binary
    let _root = compute_merkle_root(leaf, invalid_proof);
}

/// Attack: Modify leaf after computing proof
/// Expected: MUST FAIL - proof is cryptographically bound to leaf
#[test(should_fail)]
fn test_leaf_modification_attack() {
    let original_leaf = 100;
    let proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let root = compute_merkle_root(original_leaf, proof);

    // Attacker modifies leaf value
    let modified_leaf = 101;

    // Verification must fail
    assert(
        verify_merkle_inclusion(modified_leaf, root, proof),
        "Modified leaf cannot verify against original proof",
    );
}

/// Attack: Claim empty leaf (0) exists when tree has values
/// Expected: MUST FAIL unless 0 is actually in the tree
#[test(should_fail)]
fn test_empty_leaf_forgery() {
    // Build tree with non-zero leaves
    let real_leaf = 100;
    let proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let root = compute_merkle_root(real_leaf, proof);

    // Attacker tries to claim empty leaf exists
    let empty_leaf = 0;

    assert(verify_merkle_inclusion(empty_leaf, root, proof), "Cannot forge proof for empty leaf");
}

/// Attack: Use mismatched proof depth
/// Expected: Type system prevents this - proof depth is generic parameter
/// This test documents the type-level protection
#[test]
fn test_proof_depth_type_safety() {
    // TREE_DEPTH is const generic = 24
    let leaf = 100;

    // Proof must have exactly TREE_DEPTH siblings and indices
    let siblings: [Field; 24] = [
        200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700,
        1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500,
    ];
    let path_indices: [Field; 24] =
        [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
    let proof: MerkleProof<TREE_DEPTH> = MerkleProof { siblings, path_indices };

    let root = compute_merkle_root(leaf, proof);
    assert(verify_merkle_inclusion(leaf, root, proof));
    // Attempting to create proof with wrong depth would fail at compile time:
    // let wrong_depth_proof: MerkleProof<5> = MerkleProof {
    //     siblings: [200, 300, 400],  // Type error: expected 5 elements
    //     path_indices: [0, 1, 0]
    // };
}

/// Attack: Exploit hash collision in Poseidon2
/// Expected: MUST FAIL - Poseidon2 is collision-resistant
#[test]
fn test_hash_collision_resistance() {
    // Try to find two different inputs that produce same hash
    let left1 = 100;
    let right1 = 200;
    let hash1 = Poseidon2::hash([left1, right1], 2);

    let left2 = 101; // Different inputs
    let right2 = 200;
    let hash2 = Poseidon2::hash([left2, right2], 2);

    // Hashes must be different
    assert(hash1 != hash2, "Hash collision detected");

    let left3 = 100;
    let right3 = 201; // Different right value
    let hash3 = Poseidon2::hash([left3, right3], 2);

    assert(hash1 != hash3, "Hash collision detected");
}

/// Attack: Pre-image attack on merkle root
/// Expected: MUST FAIL - cannot find leaf that hashes to specific root
#[test]
fn test_merkle_preimage_resistance() {
    let target_root = 123456789; // Attacker wants to create proof for this root
    // Try different leaves to see if any produce target root
    let attempt1 = 100;
    let proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let result1 = compute_merkle_root(attempt1, proof);

    let attempt2 = 200;
    let result2 = compute_merkle_root(attempt2, proof);

    // Extremely unlikely to match target root (collision resistance)
    assert(result1 != target_root, "Pre-image attack succeeded");
    assert(result2 != target_root, "Pre-image attack succeeded");
}
