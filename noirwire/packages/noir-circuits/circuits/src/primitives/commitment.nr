use std::hash::poseidon2::Poseidon2;

/// Balance structure
/// Used for both solo users and vault members
pub struct Balance {
    owner: Field,           // Poseidon2 hash of public key
    amount: Field,          // Token amount (as Field)
    vault_id: Field,        // 0 for solo users, vault hash for members
    blinding: Field,        // Random blinding factor
}

/// Compute a commitment to a balance
/// commitment = H(owner, amount, vault_id, blinding)
pub fn compute_commitment(balance: Balance) -> Field {
    let inputs = [
        balance.owner,
        balance.amount,
        balance.vault_id,
        balance.blinding
    ];
    Poseidon2::hash(inputs, 4)
}

/// Verify a commitment matches the given balance
pub fn verify_commitment(
    commitment: Field,
    owner: Field,
    amount: Field,
    vault_id: Field,
    blinding: Field
) -> bool {
    let computed = Poseidon2::hash([owner, amount, vault_id, blinding], 4);
    computed == commitment
}

#[test]
fn test_commitment() {
    let balance = Balance {
        owner: 12345,
        amount: 1000,
        vault_id: 0,  // Solo user
        blinding: 99999
    };

    let commitment = compute_commitment(balance);
    assert(verify_commitment(
        commitment,
        balance.owner,
        balance.amount,
        balance.vault_id,
        balance.blinding
    ));
}
