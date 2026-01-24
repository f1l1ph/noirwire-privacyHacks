use std::hash::poseidon2::Poseidon2;

/// Tree depth: 24 levels = 2^24 (~16M) possible leaves
global TREE_DEPTH: u32 = 24;

/// Merkle proof structure
pub struct MerkleProof<let N: u32> {
    siblings: [Field; N],      // Sibling hashes
    path_indices: [u1; N],     // Left (0) or Right (1)
}

/// Verify merkle inclusion proof
/// Proves that a leaf exists in a tree with the given root
pub fn verify_merkle_inclusion<let N: u32>(
    leaf: Field,
    root: Field,
    proof: MerkleProof<N>
) -> bool {
    let mut current = leaf;

    for i in 0..N {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];

        current = if is_right == 1 {
            Poseidon2::hash([sibling, current], 2)
        } else {
            Poseidon2::hash([current, sibling], 2)
        };
    }

    current == root
}

/// Compute merkle root from leaf and proof
pub fn compute_merkle_root<let N: u32>(
    leaf: Field,
    proof: MerkleProof<N>
) -> Field {
    let mut current = leaf;

    for i in 0..N {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];

        current = if is_right == 1 {
            Poseidon2::hash([sibling, current], 2)
        } else {
            Poseidon2::hash([current, sibling], 2)
        };
    }

    current
}

/// Ensure the provided path indices are boolean and match the claimed leaf index
fn assert_path_matches_index<let N: u32>(leaf_index: Field, proof: MerkleProof<N>) {
    let index_u64 = leaf_index as u64;
    let mut expected: u64 = 0;

    for i in 0..N {
        let bit = proof.path_indices[i] as u64;
        // Constrain bit to 0 or 1
        assert(bit == 0 || bit == 1);
        expected += bit << i;
    }

    // Constrain reconstructed index to the provided leaf index
    assert(index_u64 == expected);
    assert(leaf_index == (index_u64 as Field));
}

/// Verify updating a leaf in the tree
/// Proves that replacing old_leaf with new_leaf at leaf_index
/// correctly transitions old_root to new_root
pub fn verify_merkle_update<let N: u32>(
    old_leaf: Field,
    new_leaf: Field,
    leaf_index: Field,
    old_root: Field,
    new_root: Field,
    proof: MerkleProof<N>
) -> bool {
    // Bind path to the declared leaf index to prevent index mismatches
    assert_path_matches_index(leaf_index, proof);

    // Verify old leaf was in tree
    let old_root_check = compute_merkle_root(old_leaf, proof);
    if old_root_check != old_root {
        false
    } else {
        // Verify new leaf produces new root
        let new_root_check = compute_merkle_root(new_leaf, proof);
        new_root_check == new_root
    }
}

/// Compute intermediate root after single update
/// Helper for chaining multiple updates
pub fn compute_intermediate_root<let N: u32>(
    leaf_index: Field,
    new_leaf: Field,
    proof: MerkleProof<N>
) -> Field {
    // Enforce index/path consistency for chained updates
    assert_path_matches_index(leaf_index, proof);
    compute_merkle_root(new_leaf, proof)
}

/// Verify batch tree update (multiple insertions/deletions)
/// Note: In production, this should verify path_indices match leaf_index bit decomposition
pub fn verify_batch_update<let N: u32, let M: u32>(
    updates: [(Field, Field); M], // (old_leaf, new_leaf) pairs
    indices: [Field; M],
    old_root: Field,
    new_root: Field,
    proofs: [MerkleProof<N>; M]
) -> bool {
    let mut current_root = old_root;
    
    for i in 0..M {
        let (old_leaf, new_leaf) = updates[i];
        let proof = proofs[i];
        let leaf_index = indices[i];

        // Enforce index/path consistency for each update
        assert_path_matches_index(leaf_index, proof);
        
        // Verify old leaf exists
        let computed_old = compute_merkle_root(old_leaf, proof);
        if computed_old != current_root {
            return false;
        }
        
        // Update to new leaf
        current_root = compute_merkle_root(new_leaf, proof);
    }
    
    current_root == new_root
}

#[test]
fn test_merkle_proof() {
    // Simple 3-level tree test
    let leaf = 100;
    let sibling1 = 200;
    let sibling2 = 300;
    let sibling3 = 400;

    // Build proof: leaf is at position [left, right, left]
    let proof = MerkleProof {
        siblings: [sibling1, sibling2, sibling3],
        path_indices: [0, 1, 0]
    };

    // Manually compute expected root
    let level1 = Poseidon2::hash([leaf, sibling1], 2);
    let level2 = Poseidon2::hash([sibling2, level1], 2);
    let expected_root = Poseidon2::hash([level2, sibling3], 2);

    // Verify proof
    assert(verify_merkle_inclusion(leaf, expected_root, proof));

    // Compute root
    let computed_root = compute_merkle_root(leaf, proof);
    assert(computed_root == expected_root);
}

#[test]
fn test_merkle_single_update() {
    // Test updating single leaf
    let old_leaf = 100;
    let new_leaf = 999;
    let sibling1 = 200;
    let sibling2 = 300;
    let sibling3 = 400;

    let proof = MerkleProof {
        siblings: [sibling1, sibling2, sibling3],
        path_indices: [0, 1, 0]
    };

    // Compute old and new roots
    let level1_old = Poseidon2::hash([old_leaf, sibling1], 2);
    let level2_old = Poseidon2::hash([sibling2, level1_old], 2);
    let old_root = Poseidon2::hash([level2_old, sibling3], 2);

    let level1_new = Poseidon2::hash([new_leaf, sibling1], 2);
    let level2_new = Poseidon2::hash([sibling2, level1_new], 2);
    let new_root = Poseidon2::hash([level2_new, sibling3], 2);

    // Verify update
    assert(verify_merkle_update(old_leaf, new_leaf, 0, old_root, new_root, proof));
}

#[test]
fn test_merkle_insertion() {
    // Test inserting into empty leaf (0 → commitment)
    let empty_leaf = 0;
    let new_commitment = 12345;
    let sibling1 = 200;
    let sibling2 = 300;
    let sibling3 = 400;

    let proof = MerkleProof {
        siblings: [sibling1, sibling2, sibling3],
        path_indices: [0, 1, 0]
    };

    // Compute old root (with empty leaf)
    let level1_old = Poseidon2::hash([empty_leaf, sibling1], 2);
    let level2_old = Poseidon2::hash([sibling2, level1_old], 2);
    let old_root = Poseidon2::hash([level2_old, sibling3], 2);

    // Compute new root (with commitment)
    let level1_new = Poseidon2::hash([new_commitment, sibling1], 2);
    let level2_new = Poseidon2::hash([sibling2, level1_new], 2);
    let new_root = Poseidon2::hash([level2_new, sibling3], 2);

    // Verify insertion
    assert(verify_merkle_update(empty_leaf, new_commitment, 0, old_root, new_root, proof));
}
