#![allow(dead_code)]

use crate::primitives::commitment::{Balance, compute_commitment};
use crate::primitives::merkle::{
    compute_intermediate_root, MerkleProof, TREE_DEPTH, verify_merkle_inclusion,
    verify_merkle_update,
};
use crate::primitives::nullifier::compute_nullifier;

/// Public inputs for transfer circuit
pub struct TransferPublic {
    nullifier: Field, // Prevents double-spend
    old_root: Field, // Current merkle root
    new_root: Field, // New merkle root after transfer
}

/// Private inputs for transfer circuit
pub struct TransferPrivate {
    // Sender's balance
    sender_owner: Field,
    sender_amount: Field,
    sender_vault_id: Field,
    sender_blinding: Field,
    sender_secret: Field,
    sender_proof: MerkleProof<TREE_DEPTH>,
    sender_leaf_index: Field,

    // Transfer amount
    transfer_amount: Field,
    nonce: Field,

    // Receiver's balance
    receiver_owner: Field,
    receiver_vault_id: Field,
    receiver_blinding: Field,
    receiver_leaf_index: Field,
    receiver_proof: MerkleProof<TREE_DEPTH>,

    // New sender balance (remainder)
    new_sender_blinding: Field,
    new_sender_leaf_index: Field,
    new_sender_proof: MerkleProof<TREE_DEPTH>,
}

/// Main transfer circuit
/// Proves a valid private transfer between two parties
pub fn main(public: TransferPublic, private: TransferPrivate) {
    // ===== SENDER CHECKS =====
    // 1. Reconstruct sender's commitment
    let sender_balance = Balance {
        owner: private.sender_owner,
        amount: private.sender_amount,
        vault_id: private.sender_vault_id,
        blinding: private.sender_blinding,
    };
    let sender_commitment = compute_commitment(sender_balance);

    // 2. Verify sender's balance exists in tree
    assert(verify_merkle_inclusion(sender_commitment, public.old_root, private.sender_proof));

    // 3. Verify nullifier is correct
    let computed_nullifier =
        compute_nullifier(sender_commitment, private.sender_secret, private.nonce);
    assert(computed_nullifier == public.nullifier);

    // 4. Verify sufficient balance with range check
    let sender_amount_u64 = private.sender_amount as u64;
    let transfer_amount_u64 = private.transfer_amount as u64;
    assert(sender_amount_u64 >= transfer_amount_u64);

    // Range checks to prevent overflow
    assert(private.sender_amount == (sender_amount_u64 as Field));
    assert(private.transfer_amount == (transfer_amount_u64 as Field));

    // ===== BALANCE CONSERVATION =====
    // 5. Compute new balances
    let new_sender_amount = private.sender_amount - private.transfer_amount;

    // 6. Compute new sender commitment
    let new_sender_balance = Balance {
        owner: private.sender_owner,
        amount: new_sender_amount,
        vault_id: private.sender_vault_id,
        blinding: private.new_sender_blinding,
    };
    let new_sender_commitment = compute_commitment(new_sender_balance);

    // 7. Compute receiver commitment
    let receiver_balance = Balance {
        owner: private.receiver_owner,
        amount: private.transfer_amount,
        vault_id: private.receiver_vault_id,
        blinding: private.receiver_blinding,
    };
    let receiver_commitment = compute_commitment(receiver_balance);

    // ===== TREE UPDATE VERIFICATION =====
    // Step 1: Verify sender commitment removal (nullify)
    let intermediate_root = compute_intermediate_root(
        private.sender_leaf_index,
        0, // Nullify (set to empty)
        private.sender_proof,
    );

    // Step 2: If new_sender_amount > 0, add new sender commitment
    let root_after_sender = if new_sender_amount != 0 {
        // Verify insertion of new sender commitment
        assert(verify_merkle_update(
            0, // Empty leaf
            new_sender_commitment,
            private.new_sender_leaf_index,
            intermediate_root,
            compute_intermediate_root(
                private.new_sender_leaf_index,
                new_sender_commitment,
                private.new_sender_proof,
            ),
            private.new_sender_proof,
        ));
        compute_intermediate_root(
            private.new_sender_leaf_index,
            new_sender_commitment,
            private.new_sender_proof,
        )
    } else {
        intermediate_root
    };

    // Step 3: Add receiver commitment
    assert(verify_merkle_update(
        0, // empty leaf
        receiver_commitment,
        private.receiver_leaf_index,
        root_after_sender,
        public.new_root,
        private.receiver_proof,
    ));
}

#[test]
fn test_transfer_balance_conservation() {
    // Simple test for balance conservation logic
    let sender_amount = 1000;
    let transfer_amount = 300;
    let new_sender_amount = sender_amount - transfer_amount;

    assert(new_sender_amount == 700);
}

#[test]
fn test_insufficient_balance_fails() {
    let sender_amount_u64: u64 = 100;
    let transfer_amount_u64: u64 = 200;

    // Expect insufficient balance condition to hold
    let has_sufficient = sender_amount_u64 >= transfer_amount_u64;
    assert(!has_sufficient);
}
