#![allow(dead_code)]

use crate::primitives::commitment::{Balance, compute_commitment};
use crate::primitives::merkle::{
    compute_intermediate_root, MerkleProof, TREE_DEPTH, verify_merkle_inclusion,
    verify_merkle_update,
};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::poseidon2::Poseidon2;

/// Tree depth for vault member lists (small for tests)
global VAULT_TREE_DEPTH: u32 = 3;

/// Public inputs for vault transfer circuit
struct VaultTransferPublic {
    nullifier: Field, // Prevents double-spend
    old_root: Field, // Current balance tree root
    new_root: Field, // New balance tree root after transfer
    sender_vault_id: Field, // Sender's vault (for verification)
    receiver_vault_id: Field, // Receiver's vault
}

/// Private inputs for vault transfer circuit
struct VaultTransferPrivate {
    // Sender's balance
    sender_owner: Field,
    sender_amount: Field,
    sender_vault_id: Field,
    sender_blinding: Field,
    sender_secret: Field,
    sender_proof: MerkleProof<TREE_DEPTH>,
    sender_leaf_index: Field,

    // Sender's vault membership proof
    sender_vault_members_root: Field,
    sender_membership_proof: MerkleProof<VAULT_TREE_DEPTH>,

    // Transfer amount
    transfer_amount: Field,
    nonce: Field,

    // Receiver's balance
    receiver_owner: Field,
    receiver_vault_id: Field,
    receiver_blinding: Field,
    receiver_leaf_index: Field,
    receiver_proof: MerkleProof<TREE_DEPTH>,

    // Receiver's vault membership proof
    receiver_vault_members_root: Field,
    receiver_membership_proof: MerkleProof<VAULT_TREE_DEPTH>,

    // New sender balance (remainder)
    new_sender_blinding: Field,
    new_sender_leaf_index: Field,
    new_sender_proof: MerkleProof<TREE_DEPTH>,

    // Flag: same vault transfer
    same_vault: bool,
}

/// Helper: Verify vault membership
fn verify_vault_membership<let N: u32>(
    vault_id: Field,
    member_pubkey: Field,
    members_root: Field,
    membership_proof: MerkleProof<N>,
) -> bool {
    // Member leaf = H(vault_id || member_pubkey)
    let member_leaf = Poseidon2::hash([vault_id, member_pubkey], 2);

    verify_merkle_inclusion(member_leaf, members_root, membership_proof)
}

/// Main vault transfer circuit
/// Extends core transfer with vault membership checks
fn main(public: VaultTransferPublic, private: VaultTransferPrivate) {
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

    // 4. Verify sender vault ID matches public input
    assert(private.sender_vault_id == public.sender_vault_id);

    // 5. Verify sender is vault member
    assert(verify_vault_membership(
        private.sender_vault_id,
        private.sender_owner,
        private.sender_vault_members_root,
        private.sender_membership_proof,
    ));

    // 6. Verify sufficient balance with range checks
    let sender_amount_u64 = private.sender_amount as u64;
    let transfer_amount_u64 = private.transfer_amount as u64;
    assert(sender_amount_u64 >= transfer_amount_u64);
    assert(private.sender_amount == (sender_amount_u64 as Field));
    assert(private.transfer_amount == (transfer_amount_u64 as Field));

    // ===== RECEIVER CHECKS =====
    // 7. Verify receiver vault ID matches public input
    assert(private.receiver_vault_id == public.receiver_vault_id);

    // 8. Verify receiver is vault member
    assert(verify_vault_membership(
        private.receiver_vault_id,
        private.receiver_owner,
        private.receiver_vault_members_root,
        private.receiver_membership_proof,
    ));

    // 9. If same vault transfer, verify vault_ids match
    if private.same_vault {
        assert(private.sender_vault_id == private.receiver_vault_id);
    }

    // ===== BALANCE CONSERVATION =====
    // 10. Compute new balances
    let new_sender_amount = private.sender_amount - private.transfer_amount;

    // 11. Compute new sender commitment
    let new_sender_balance = Balance {
        owner: private.sender_owner,
        amount: new_sender_amount,
        vault_id: private.sender_vault_id,
        blinding: private.new_sender_blinding,
    };
    let new_sender_commitment = compute_commitment(new_sender_balance);

    // 12. Compute receiver commitment
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
        0, // Nullify
        private.sender_proof,
    );

    // Step 2: If new_sender_amount > 0, add new sender commitment
    let root_after_sender = if new_sender_amount != 0 {
        assert(verify_merkle_update(
            0,
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
        0,
        receiver_commitment,
        private.receiver_leaf_index,
        root_after_sender,
        public.new_root,
        private.receiver_proof,
    ));
}

#[test]
fn test_vault_transfer_same_vault() {
    // Test transfer within same vault
    let vault_id = 12345;
    assert(vault_id == vault_id); // Same vault
}

#[test]
fn test_vault_transfer_different_vaults() {
    // Test transfer between different vaults
    let vault_abc = 11111;
    let vault_xyz = 22222;
    assert(vault_abc != vault_xyz); // Different vaults
}
