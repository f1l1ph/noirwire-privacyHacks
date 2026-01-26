use crate::primitives::commitment::Balance;
use crate::primitives::commitment::compute_commitment;
use crate::primitives::merkle::{MerkleProof, TREE_DEPTH, verify_merkle_update};
use crate::primitives::poseidon2::Poseidon2;

/// Public inputs for deposit circuit
pub struct DepositPublic {
    deposit_amount: Field, // Amount being deposited (visible on L1)
    new_commitment: Field, // New balance commitment
    leaf_index: Field, // Index where commitment is inserted
    old_root: Field, // Merkle root before insertion
    new_root: Field, // Merkle root after insertion
}

/// Private inputs for deposit circuit
pub struct DepositPrivate {
    owner: Field, // Owner's public key hash
    vault_id: Field, // 0 for solo, vault ID for vault members
    blinding: Field, // Random blinding factor
    insertion_proof: MerkleProof<TREE_DEPTH>, // Proof of insertion
}

/// Main deposit circuit
/// Proves that a public deposit creates a valid private balance
pub fn main(public: DepositPublic, private: DepositPrivate) {
    // 1. Verify commitment is correctly computed
    let balance = Balance {
        owner: private.owner,
        amount: public.deposit_amount,
        vault_id: private.vault_id,
        blinding: private.blinding,
    };

    let computed_commitment = compute_commitment(balance);
    assert(computed_commitment == public.new_commitment);

    // 2. Verify merkle tree insertion (empty leaf -> commitment)
    assert(verify_merkle_update(
        0, // old_leaf (empty)
        public.new_commitment,
        public.leaf_index,
        public.old_root,
        public.new_root,
        private.insertion_proof,
    ));

    // 3. Range check: amount must fit in u64 (prevent overflow)
    let amount_u64 = public.deposit_amount as u64;
    let amount_back = amount_u64 as Field;
    assert(public.deposit_amount == amount_back);

    // 4. Amount must be strictly positive
    assert(amount_u64 > 0);
}

#[test]
fn test_deposit_circuit() {
    let deposit_amount = 1000;
    let owner = 12345;
    let vault_id = 0; // Solo user
    let blinding = 99999;

    let balance = Balance { owner, amount: deposit_amount, vault_id, blinding };

    let commitment = compute_commitment(balance);

    // Mock merkle proof (24 levels for production)
    let siblings: [Field; 24] = [
        200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700,
        1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500,
    ];
    let path_indices: [Field; 24] =
        [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
    let insertion_proof = MerkleProof { siblings, path_indices };

    // Compute root by following merkle proof path
    let mut current = 0; // old_leaf (empty)
    for i in 0..24 {
        let is_right = path_indices[i];
        if is_right == 0 {
            current = Poseidon2::hash([current, siblings[i]], 2);
        } else {
            current = Poseidon2::hash([siblings[i], current], 2);
        }
    }
    let old_root = current;

    // Now compute new root with commitment
    current = commitment;
    for i in 0..24 {
        let is_right = path_indices[i];
        if is_right == 0 {
            current = Poseidon2::hash([current, siblings[i]], 2);
        } else {
            current = Poseidon2::hash([siblings[i], current], 2);
        }
    }
    let new_root = current;

    let public = DepositPublic {
        deposit_amount,
        new_commitment: commitment,
        leaf_index: 0,
        old_root,
        new_root,
    };

    let private = DepositPrivate { owner, vault_id, blinding, insertion_proof };

    main(public, private);
}
