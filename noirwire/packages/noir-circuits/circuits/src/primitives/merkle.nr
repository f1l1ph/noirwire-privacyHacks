use crate::primitives::poseidon2::Poseidon2;

// TREE_DEPTH = 24 for production (supports 16,777,216 leaves)
// Previously set to 3 for testing - now updated for production deployment
pub global TREE_DEPTH: u32 = 24;

pub struct MerkleProof<let N: u32> {
    pub siblings: [Field; N],
    pub path_indices: [Field; N],
}

fn hash_pair(left: Field, right: Field) -> Field {
    Poseidon2::hash([left, right], 2)
}

pub fn compute_merkle_root<let N: u32>(leaf: Field, proof: MerkleProof<N>) -> Field {
    let mut current = leaf;
    for i in 0..N {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];
        assert((is_right == 0) | (is_right == 1));

        // Use assert to constrain the path, then compute both possible values
        // and select based on is_right using arithmetic
        let left_hash = hash_pair(current, sibling);
        let right_hash = hash_pair(sibling, current);

        // is_right is either 0 or 1, so we can use it to select:
        // if is_right == 0: result = left_hash
        // if is_right == 1: result = right_hash
        current = left_hash + is_right * (right_hash - left_hash);
    }

    current
}

pub fn verify_merkle_inclusion<let N: u32>(
    leaf: Field,
    root: Field,
    proof: MerkleProof<N>,
) -> bool {
    let computed = compute_merkle_root(leaf, proof);
    computed == root
}

pub fn verify_merkle_update<let N: u32>(
    old_leaf: Field,
    new_leaf: Field,
    _leaf_index: Field,
    old_root: Field,
    new_root: Field,
    proof: MerkleProof<N>,
) -> bool {
    let old_root_check = compute_merkle_root(old_leaf, proof);
    let ok_old = old_root_check == old_root;

    let new_root_check = compute_merkle_root(new_leaf, proof);
    let ok_new = new_root_check == new_root;

    ok_old & ok_new
}

pub fn compute_intermediate_root<let N: u32>(
    _leaf_index: Field,
    new_leaf: Field,
    proof: MerkleProof<N>,
) -> Field {
    compute_merkle_root(new_leaf, proof)
}

pub fn verify_batch_update<let N: u32, let M: u32>(
    updates: [(Field, Field); M],
    _indices: [Field; M],
    old_root: Field,
    new_root: Field,
    proofs: [MerkleProof<N>; M],
) -> bool {
    let mut current_root = old_root;
    let mut all_valid = true;

    for i in 0..M {
        let update = updates[i];
        let old_leaf = update.0;
        let new_leaf = update.1;
        let proof = proofs[i];

        let check_old = compute_merkle_root(old_leaf, proof);
        // Track validity without early return
        let is_valid = check_old == current_root;
        all_valid = all_valid & is_valid;

        let next_root = compute_merkle_root(new_leaf, proof);
        current_root = next_root;
    }

    all_valid & (current_root == new_root)
}
