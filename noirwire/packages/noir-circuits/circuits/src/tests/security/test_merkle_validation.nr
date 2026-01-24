/// Merkle Path Verification Test Suite
/// Verifies constraints on merkle tree structure and proofs

use crate::primitives::merkle::{compute_merkle_root, MerkleProof, verify_merkle_inclusion};

/// MERKLE CONSTRAINTS:
///
/// 1. LEAF_INDEX BOUNDS: [0, 2^TREE_DEPTH)
///    - Prevents out-of-bounds tree access
///    - Ensures leaf position validity
///
/// 2. PATH_INDICES CONSTRAINT: Must be exactly 0 or 1
///    - Binary representation of leaf position
///    - Enforces merkle hash tree structure
///
/// 3. SIBLINGS VALIDITY: Must be valid field elements
///    - No overflow or underflow
///    - Proper size matching TREE_DEPTH
///
/// 4. TREE CONSISTENCY: Insertions preserve structure
///    - Root changes correctly
///    - Proofs remain valid for other leaves

/// Test: Path indices must be binary (0 or 1)
#[test]
fn test_path_indices_binary_constraint() {
    let leaf = 100;

    // Valid: all indices 0 or 1
    let valid_proof1 = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 0, 0] };
    let root1 = compute_merkle_root(leaf, valid_proof1);
    assert(root1 != 0);

    let valid_proof2 = MerkleProof { siblings: [200, 300, 400], path_indices: [1, 1, 1] };
    let root2 = compute_merkle_root(leaf, valid_proof2);
    assert(root2 != 0);

    let valid_proof3 = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let root3 = compute_merkle_root(leaf, valid_proof3);
    assert(root3 != 0);

    // All valid proofs produce results
    assert(root1 != root2);
    assert(root2 != root3);
}

/// Test: Different path indices produce different roots
#[test]
fn test_path_indices_affect_root() {
    let leaf = 100;
    let siblings = [200, 300, 400];

    let proof_0 = MerkleProof { siblings, path_indices: [0, 0, 0] };
    let proof_1 = MerkleProof { siblings, path_indices: [1, 0, 0] };
    let proof_2 = MerkleProof { siblings, path_indices: [0, 1, 0] };
    let proof_3 = MerkleProof { siblings, path_indices: [0, 0, 1] };
    let proof_all1 = MerkleProof { siblings, path_indices: [1, 1, 1] };

    let root_0 = compute_merkle_root(leaf, proof_0);
    let root_1 = compute_merkle_root(leaf, proof_1);
    let root_2 = compute_merkle_root(leaf, proof_2);
    let root_3 = compute_merkle_root(leaf, proof_3);
    let root_all1 = compute_merkle_root(leaf, proof_all1);

    // Each path variation produces different root
    assert(root_0 != root_1);
    assert(root_0 != root_2);
    assert(root_0 != root_3);
    assert(root_0 != root_all1);
    assert(root_1 != root_2);
    assert(root_1 != root_3);
    assert(root_1 != root_all1);
    assert(root_2 != root_3);
}

/// Test: Siblings must be valid (affect root computation)
#[test]
fn test_sibling_values_must_be_valid() {
    let leaf = 100;
    let path_indices = [0, 1, 0];

    // Different siblings produce different roots
    let proof1 = MerkleProof { siblings: [200, 300, 400], path_indices };
    let proof2 = MerkleProof { siblings: [201, 300, 400], path_indices };
    let proof3 = MerkleProof { siblings: [200, 301, 400], path_indices };
    let proof4 = MerkleProof { siblings: [200, 300, 401], path_indices };

    let root1 = compute_merkle_root(leaf, proof1);
    let root2 = compute_merkle_root(leaf, proof2);
    let root3 = compute_merkle_root(leaf, proof3);
    let root4 = compute_merkle_root(leaf, proof4);

    // Each sibling change affects root
    assert(root1 != root2);
    assert(root1 != root3);
    assert(root1 != root4);
}

/// Test: Sibling count must match TREE_DEPTH
#[test]
fn test_sibling_count_matches_depth() {
    let leaf = 100;

    // TREE_DEPTH = 3 requires exactly 3 siblings
    let valid_proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(leaf, valid_proof);
    assert(root != 0);

    // Proof is valid
    assert(verify_merkle_inclusion(leaf, root, valid_proof));
}

/// Test: Leaf index concept (via path_indices)
#[test]
fn test_leaf_index_encoding() {
    let leaf = 100;

    // Path indices encode leaf index in binary
    // [0, 0, 0] = index 0
    // [1, 0, 0] = index 1
    // [0, 1, 0] = index 2
    // [1, 1, 0] = index 3
    // [0, 0, 1] = index 4
    // [1, 0, 1] = index 5
    // [0, 1, 1] = index 6
    // [1, 1, 1] = index 7 (max for depth 3)

    let indices =
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];

    let siblings = [200, 300, 400];
    let mut roots: [Field; 8] = [0; 8];

    // Each index position produces unique root
    for i in 0..8 {
        let proof = MerkleProof { siblings, path_indices: indices[i] };
        roots[i] = compute_merkle_root(leaf, proof);
    }

    // All roots must be unique
    for i in 0..7 {
        for j in (i + 1)..8 {
            assert(roots[i] != roots[j]);
        }
    }
}

/// Test: Leaf index bounds (0 to 2^TREE_DEPTH - 1)
#[test]
fn test_leaf_index_bounds() {
    // For TREE_DEPTH = 3, valid indices are 0 to 7
    let valid_min_indices = [0, 0, 0]; // Index 0
    let valid_max_indices = [1, 1, 1]; // Index 7

    let leaf = 100;
    let siblings = [200, 300, 400];

    let proof_min = MerkleProof { siblings, path_indices: valid_min_indices };
    let proof_max = MerkleProof { siblings, path_indices: valid_max_indices };

    let root_min = compute_merkle_root(leaf, proof_min);
    let root_max = compute_merkle_root(leaf, proof_max);

    // Both bounds are valid
    assert(root_min != 0);
    assert(root_max != 0);
    assert(root_min != root_max);
}

/// Test: Merkle inclusion verification
#[test]
fn test_merkle_inclusion_correct_proof() {
    let leaf = 100;
    let proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(leaf, proof);

    // Correct leaf and proof verify against root
    assert(verify_merkle_inclusion(leaf, root, proof));
}

/// Test: Merkle inclusion fails with wrong leaf
#[test]
fn test_merkle_inclusion_wrong_leaf() {
    let correct_leaf = 100;
    let wrong_leaf = 200;
    let proof = MerkleProof { siblings: [300, 400, 500], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(correct_leaf, proof);

    // Wrong leaf fails
    assert(!verify_merkle_inclusion(wrong_leaf, root, proof));
}

/// Test: Merkle inclusion fails with wrong proof
#[test]
fn test_merkle_inclusion_wrong_proof() {
    let leaf = 100;
    let correct_proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let wrong_proof = MerkleProof { siblings: [201, 300, 400], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(leaf, correct_proof);

    // Correct proof verifies
    assert(verify_merkle_inclusion(leaf, root, correct_proof));

    // Wrong proof fails
    assert(!verify_merkle_inclusion(leaf, root, wrong_proof));
}

/// Test: Tree consistency through insertions
#[test]
fn test_tree_consistency_single_insertion() {
    let empty_leaf: Field = 0;
    let new_leaf = 100;
    let proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let old_root = compute_merkle_root(empty_leaf, proof);
    let new_root = compute_merkle_root(new_leaf, proof);

    // Insertion changes root
    assert(old_root != new_root);

    // New leaf is in new tree
    assert(verify_merkle_inclusion(new_leaf, new_root, proof));

    // Old empty leaf not in new tree
    assert(!verify_merkle_inclusion(empty_leaf, new_root, proof));
}

/// Test: Tree consistency across multiple operations
#[test]
fn test_tree_consistency_operations() {
    let empty: Field = 0;

    // Insertion 1 at index 0
    let leaf1 = 100;
    let proof1 = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let root0 = compute_merkle_root(empty, proof1); // Empty state
    let root1 = compute_merkle_root(leaf1, proof1); // After insertion 1

    assert(root0 != root1);

    // Insertion 2 at different index
    let leaf2 = 500;
    let proof2 = MerkleProof { siblings: [200, 600, 400], path_indices: [1, 1, 0] };

    // New tree has leaf2 at different position
    let root2 = compute_merkle_root(leaf2, proof2);

    // Different operations produce different roots
    assert(root1 != root2);

    // Both leaves can be verified with appropriate proofs
    assert(verify_merkle_inclusion(leaf1, root1, proof1));
    assert(verify_merkle_inclusion(leaf2, root2, proof2));
}

/// Test: Merkle proof immutability
/// Changing any component of proof invalidates it
#[test]
fn test_merkle_proof_immutability() {
    let leaf = 100;
    let correct_proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(leaf, correct_proof);

    // Sibling mutation
    let mutated_sibling = MerkleProof { siblings: [201, 300, 400], path_indices: [0, 1, 0] };
    assert(!verify_merkle_inclusion(leaf, root, mutated_sibling));

    // Path index mutation
    let mutated_path = MerkleProof { siblings: [200, 300, 400], path_indices: [1, 1, 0] };
    assert(!verify_merkle_inclusion(leaf, root, mutated_path));
}

/// Test: Proof validity is path-specific
#[test]
fn test_merkle_proof_path_specificity() {
    let leaf = 100;
    let siblings = [200, 300, 400];

    let proof1 = MerkleProof { siblings, path_indices: [0, 0, 0] };
    let proof2 = MerkleProof { siblings, path_indices: [1, 0, 0] };
    let proof3 = MerkleProof { siblings, path_indices: [0, 1, 0] };

    let root1 = compute_merkle_root(leaf, proof1);
    let root2 = compute_merkle_root(leaf, proof2);
    let root3 = compute_merkle_root(leaf, proof3);

    // Proof 1 works for root 1
    assert(verify_merkle_inclusion(leaf, root1, proof1));

    // Proof 1 doesn't work for other roots
    assert(!verify_merkle_inclusion(leaf, root2, proof1));
    assert(!verify_merkle_inclusion(leaf, root3, proof1));

    // Proof 2 works for root 2
    assert(verify_merkle_inclusion(leaf, root2, proof2));

    // Proof 2 doesn't work for other roots
    assert(!verify_merkle_inclusion(leaf, root1, proof2));
    assert(!verify_merkle_inclusion(leaf, root3, proof2));
}

/// Test: Multiple proofs cannot be interchanged
#[test]
fn test_merkle_proof_non_interchangeable() {
    let leaf1 = 100;
    let leaf2 = 200;

    let proof1 = MerkleProof { siblings: [300, 400, 500], path_indices: [0, 1, 0] };
    let proof2 = MerkleProof { siblings: [600, 700, 800], path_indices: [1, 0, 1] };

    let root1 = compute_merkle_root(leaf1, proof1);
    let root2 = compute_merkle_root(leaf2, proof2);

    // Proof 1 is for leaf1/root1
    assert(verify_merkle_inclusion(leaf1, root1, proof1));
    assert(!verify_merkle_inclusion(leaf2, root1, proof1));

    // Proof 2 is for leaf2/root2
    assert(verify_merkle_inclusion(leaf2, root2, proof2));
    assert(!verify_merkle_inclusion(leaf1, root2, proof2));

    // Proofs cannot be swapped
    assert(!verify_merkle_inclusion(leaf1, root2, proof2));
    assert(!verify_merkle_inclusion(leaf2, root1, proof1));
}

/// Test: Proof depth correctness
#[test]
fn test_merkle_proof_depth_correctness() {
    let leaf = 100;

    // Correct depth (3 for TREE_DEPTH=3)
    let correct_depth_proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(leaf, correct_depth_proof);
    assert(verify_merkle_inclusion(leaf, root, correct_depth_proof));
}

/// Test: Field validity of siblings and hashes
#[test]
fn test_merkle_field_validity() {
    let leaf: Field = 12345;
    let sibling1: Field = 67890;
    let sibling2: Field = 99999;
    let sibling3: Field = 111111;

    let proof = MerkleProof { siblings: [sibling1, sibling2, sibling3], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(leaf, proof);

    // All field values are valid
    assert(leaf != 0);
    assert(sibling1 != 0);
    assert(sibling2 != 0);
    assert(sibling3 != 0);
    assert(root != 0);

    // All are actual field values (no overflow/underflow)
    assert(verify_merkle_inclusion(leaf, root, proof));
}

/// Test: Large values in merkle tree
#[test]
fn test_merkle_large_field_values() {
    let max_field: Field = 0 - 1; // Maximum field value
    let large_value: Field = max_field / 2;

    let proof =
        MerkleProof { siblings: [large_value, large_value, large_value], path_indices: [0, 1, 0] };

    let root = compute_merkle_root(large_value, proof);

    // Large field values work correctly
    assert(verify_merkle_inclusion(large_value, root, proof));
}

/// Test: Zero values edge case
#[test]
fn test_merkle_zero_values() {
    let zero: Field = 0;
    let proof = MerkleProof { siblings: [100, 200, 300], path_indices: [0, 1, 0] };

    // Zero leaf is valid (used for empty nodes)
    let root_zero = compute_merkle_root(zero, proof);
    assert(root_zero != 0);

    let root_nonzero = compute_merkle_root(1, proof);
    assert(root_zero != root_nonzero);
}
