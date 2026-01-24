use crate::primitives::commitment::Balance;
use crate::primitives::commitment::compute_commitment;
use crate::primitives::merkle::{MerkleProof, TREE_DEPTH, verify_merkle_update};
use crate::primitives::poseidon2::Poseidon2;

/// Public inputs for deposit circuit
struct DepositPublic {
    deposit_amount: Field, // Amount being deposited (visible on L1)
    new_commitment: Field, // New balance commitment
    leaf_index: Field, // Index where commitment is inserted
    old_root: Field, // Merkle root before insertion
    new_root: Field, // Merkle root after insertion
}

/// Private inputs for deposit circuit
struct DepositPrivate {
    owner: Field, // Owner's public key hash
    vault_id: Field, // 0 for solo, vault ID for vault members
    blinding: Field, // Random blinding factor
    insertion_proof: MerkleProof<TREE_DEPTH>, // Proof of insertion
}

/// Main deposit circuit
/// Proves that a public deposit creates a valid private balance
fn main(public: DepositPublic, private: DepositPrivate) {
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

    // Mock merkle proof (3 levels for testing)
    let insertion_proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    // Compute roots manually (simplified)
    let level1_old = Poseidon2::hash([0, 200], 2);
    let level2_old = Poseidon2::hash([300, level1_old], 2);
    let old_root = Poseidon2::hash([level2_old, 400], 2);

    let level1_new = Poseidon2::hash([commitment, 200], 2);
    let level2_new = Poseidon2::hash([300, level1_new], 2);
    let new_root = Poseidon2::hash([level2_new, 400], 2);

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
