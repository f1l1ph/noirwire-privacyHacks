use std::hash::poseidon2::Poseidon2;

/// Domain separator for commitments (prevents hash collision attacks)
global COMMITMENT_DOMAIN: Field = 0x01;

/// Balance structure
/// Used for both solo users and vault members
pub struct Balance {
    owner: Field,           // Poseidon2 hash of public key
    amount: Field,          // Token amount (as Field)
    vault_id: Field,        // 0 for solo users, vault hash for members
    blinding: Field,        // Random blinding factor
}

/// Compute a commitment to a balance
/// commitment = H(domain || owner || amount || vault_id || blinding)
pub fn compute_commitment(balance: Balance) -> Field {
    let inputs = [
        COMMITMENT_DOMAIN,
        balance.owner,
        balance.amount,
        balance.vault_id,
        balance.blinding
    ];
    Poseidon2::hash(inputs, 5)
}

/// Verify a commitment matches the given balance
pub fn verify_commitment(
    commitment: Field,
    owner: Field,
    amount: Field,
    vault_id: Field,
    blinding: Field
) -> bool {
    let computed = Poseidon2::hash([COMMITMENT_DOMAIN, owner, amount, vault_id, blinding], 5);
    computed == commitment
}

/// Derive owner identifier from secret key
/// owner = H(secret_key)
pub fn derive_owner(secret_key: Field) -> Field {
    Poseidon2::hash([secret_key], 1)
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

#[test]
fn test_commitment_deterministic() {
    let balance = Balance {
        owner: 1,
        amount: 100,
        vault_id: 0,
        blinding: 12345
    };
    let c1 = compute_commitment(balance);
    let c2 = compute_commitment(balance);
    assert(c1 == c2);
}

#[test]
fn test_commitment_different_blinding() {
    let b1 = Balance {
        owner: 1,
        amount: 100,
        vault_id: 0,
        blinding: 111
    };
    let b2 = Balance {
        owner: 1,
        amount: 100,
        vault_id: 0,
        blinding: 222
    };
    assert(compute_commitment(b1) != compute_commitment(b2));
}
