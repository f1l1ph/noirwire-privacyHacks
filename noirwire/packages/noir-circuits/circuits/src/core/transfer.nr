use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::merkle::{verify_merkle_inclusion, MerkleProof, TREE_DEPTH};

/// Public inputs for transfer circuit
struct TransferPublic {
    nullifier: Field,           // Prevents double-spend
    old_root: Field,            // Current merkle root
    new_root: Field,            // New merkle root after transfer
}

/// Private inputs for transfer circuit
struct TransferPrivate {
    // Sender's balance
    sender_owner: Field,
    sender_amount: Field,
    sender_vault_id: Field,
    sender_blinding: Field,
    sender_secret: Field,
    sender_proof: MerkleProof<TREE_DEPTH>,

    // Transfer amount
    transfer_amount: Field,
    nonce: Field,

    // Receiver's balance
    receiver_owner: Field,
    receiver_vault_id: Field,
    receiver_blinding: Field,

    // New sender balance (remainder)
    new_sender_blinding: Field,
}

/// Main transfer circuit
/// Proves a valid private transfer between two parties
fn main(
    public: TransferPublic,
    private: TransferPrivate
) {
    // ===== SENDER CHECKS =====

    // 1. Reconstruct sender's commitment
    let sender_balance = Balance {
        owner: private.sender_owner,
        amount: private.sender_amount,
        vault_id: private.sender_vault_id,
        blinding: private.sender_blinding
    };
    let sender_commitment = compute_commitment(sender_balance);

    // 2. Verify sender's balance exists in tree
    assert(verify_merkle_inclusion(
        sender_commitment,
        public.old_root,
        private.sender_proof
    ));

    // 3. Verify nullifier is correct
    let computed_nullifier = compute_nullifier(
        sender_commitment,
        private.sender_secret,
        private.nonce
    );
    assert(computed_nullifier == public.nullifier);

    // 4. Verify sufficient balance
    // Note: In production, add proper range checks
    assert(private.sender_amount >= private.transfer_amount);

    // ===== BALANCE CONSERVATION =====

    // 5. Compute new balances
    let new_sender_amount = private.sender_amount - private.transfer_amount;

    // 6. Compute new sender commitment
    let new_sender_balance = Balance {
        owner: private.sender_owner,
        amount: new_sender_amount,
        vault_id: private.sender_vault_id,
        blinding: private.new_sender_blinding
    };
    let _new_sender_commitment = compute_commitment(new_sender_balance);

    // 7. Compute receiver commitment
    let receiver_balance = Balance {
        owner: private.receiver_owner,
        amount: private.transfer_amount,
        vault_id: private.receiver_vault_id,
        blinding: private.receiver_blinding
    };
    let _receiver_commitment = compute_commitment(receiver_balance);

    // 8. TODO: Verify tree update (old sender → new sender + receiver)
    // This would verify that:
    // - Old sender commitment is removed
    // - New sender commitment is added (if non-zero)
    // - Receiver commitment is added
    // - Root transition is valid (old_root → new_root)
}

#[test]
fn test_transfer_circuit() {
    // TODO: Add comprehensive test
    // This requires building a mock merkle tree
}
