use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::merkle::{verify_merkle_inclusion, MerkleProof, TREE_DEPTH};

/// Public inputs for withdraw circuit
struct WithdrawPublic {
    amount: Field,              // Amount being withdrawn
    recipient: Field,           // L1 recipient address
    nullifier: Field,           // Prevents double-spend
    old_root: Field,            // Current merkle root
    new_root: Field,            // New merkle root after withdrawal
}

/// Private inputs for withdraw circuit
struct WithdrawPrivate {
    owner: Field,
    balance: Field,
    vault_id: Field,
    blinding: Field,
    merkle_proof: MerkleProof<TREE_DEPTH>,
    nullifier_secret: Field,
    nonce: Field,
    new_balance_blinding: Field,  // For remainder if partial withdrawal
}

/// Main withdraw circuit
/// Proves a valid withdrawal from private to public
fn main(
    public: WithdrawPublic,
    private: WithdrawPrivate
) {
    // 1. Reconstruct commitment
    let balance = Balance {
        owner: private.owner,
        amount: private.balance,
        vault_id: private.vault_id,
        blinding: private.blinding
    };
    let commitment = compute_commitment(balance);

    // 2. Verify balance exists in tree
    assert(verify_merkle_inclusion(
        commitment,
        public.old_root,
        private.merkle_proof
    ));

    // 3. Verify nullifier
    let computed_nullifier = compute_nullifier(
        commitment,
        private.nullifier_secret,
        private.nonce
    );
    assert(computed_nullifier == public.nullifier);

    // 4. Verify sufficient balance
    assert(private.balance >= public.amount);

    // 5. Compute remainder
    let remainder = private.balance - public.amount;

    // 6. If remainder > 0, create new commitment
    if remainder != 0 {
        let new_balance = Balance {
            owner: private.owner,
            amount: remainder,
            vault_id: private.vault_id,
            blinding: private.new_balance_blinding
        };
        let _new_commitment = compute_commitment(new_balance);

        // TODO: Verify new commitment added to tree
    }

    // 7. TODO: Verify root transition
    // old_root → new_root is valid
}

#[test]
fn test_withdraw_circuit() {
    // TODO: Add comprehensive test
}
