use crate::primitives::commitment::compute_commitment;
use crate::primitives::commitment::Balance;

/// Public inputs for deposit circuit
struct DepositPublic {
    deposit_amount: Field,      // Amount being deposited (visible on L1)
    new_commitment: Field,      // New balance commitment
    new_root: Field,            // Merkle root after insertion
}

/// Private inputs for deposit circuit
struct DepositPrivate {
    owner: Field,               // Owner's public key hash
    vault_id: Field,            // 0 for solo, vault ID for vault members
    blinding: Field,            // Random blinding factor
    // TODO: Add merkle insertion proof
}

/// Main deposit circuit
/// Proves that a public deposit creates a valid private balance
fn main(
    public: DepositPublic,
    private: DepositPrivate
) {
    // 1. Verify commitment is correctly computed
    let balance = Balance {
        owner: private.owner,
        amount: public.deposit_amount,
        vault_id: private.vault_id,
        blinding: private.blinding
    };

    let computed_commitment = compute_commitment(balance);
    assert(computed_commitment == public.new_commitment);

    // 2. TODO: Verify merkle tree insertion
    // verify_smt_update(old_root, new_root, commitment, ...)

    // 3. Balance constraints (amount must be positive)
    // Note: In Noir, we use Field which doesn't have sign
    // The L1 program will validate u64 range
}

#[test]
fn test_deposit_circuit() {
    let deposit_amount = 1000;
    let owner = 12345;
    let vault_id = 0;  // Solo user
    let blinding = 99999;

    let balance = Balance {
        owner,
        amount: deposit_amount,
        vault_id,
        blinding
    };

    let commitment = compute_commitment(balance);

    let public = DepositPublic {
        deposit_amount,
        new_commitment: commitment,
        new_root: commitment  // Placeholder
    };

    let private = DepositPrivate {
        owner,
        vault_id,
        blinding
    };

    main(public, private);
}
