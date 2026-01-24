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
