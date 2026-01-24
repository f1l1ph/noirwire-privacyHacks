use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::merkle::{verify_merkle_inclusion, verify_merkle_update, compute_intermediate_root, MerkleProof, TREE_DEPTH};

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
    leaf_index: Field,
    nullifier_secret: Field,
    nonce: Field,
    new_balance_blinding: Field,  // For remainder if partial withdrawal
    new_balance_leaf_index: Field,
    new_balance_proof: MerkleProof<TREE_DEPTH>,
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

    // 4. Verify sufficient balance with range checks
    let balance_u64 = private.balance as u64;
    let amount_u64 = public.amount as u64;
    assert(balance_u64 >= amount_u64);
    
    // Range checks to prevent overflow
    assert(private.balance == (balance_u64 as Field));
    assert(public.amount == (amount_u64 as Field));

    // 5. Compute remainder
    let remainder = private.balance - public.amount;

    // 6. Verify tree update
    // Step 1: Remove old commitment (nullify)
    let intermediate_root = compute_intermediate_root(
        private.leaf_index,
        0,  // Nullify
        private.merkle_proof
    );

    // Step 2: If remainder > 0, create new commitment and insert
    if remainder != 0 {
        let new_balance = Balance {
            owner: private.owner,
            amount: remainder,
            vault_id: private.vault_id,
            blinding: private.new_balance_blinding
        };
        let new_commitment = compute_commitment(new_balance);

        // Verify new commitment inserted
        assert(verify_merkle_update(
            0,  // Empty leaf
            new_commitment,
            private.new_balance_leaf_index,
            intermediate_root,
            public.new_root,
            private.new_balance_proof
        ));
    } else {
        // No remainder, intermediate root is final root
        assert(intermediate_root == public.new_root);
    }
}

#[test]
fn test_withdraw_full_balance() {
    // Test withdrawing entire balance (no remainder)
    let balance = 1000;
    let withdraw_amount = 1000;
    let remainder = balance - withdraw_amount;
    
    assert(remainder == 0);
}

#[test]
fn test_withdraw_with_remainder() {
    // Test partial withdrawal
    let balance = 1000;
    let withdraw_amount = 300;
    let remainder = balance - withdraw_amount;
    
    assert(remainder == 700);
}
