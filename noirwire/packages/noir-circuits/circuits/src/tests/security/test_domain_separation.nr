/// Security Test Suite: Domain Separation Attacks
/// Tests that commitments and nullifiers cannot be confused or mixed

use crate::primitives::commitment::{compute_commitment, Balance, COMMITMENT_DOMAIN};
use crate::primitives::nullifier::{compute_nullifier, NULLIFIER_DOMAIN};
use crate::primitives::poseidon2::Poseidon2;

/// Attack: Use commitment hash as nullifier
/// Expected: MUST FAIL - different domain separators prevent this
#[test(should_fail)]
fn test_commitment_as_nullifier_attack() {
    let balance = Balance { owner: 12345, amount: 1000, vault_id: 0, blinding: 99999 };

    let commitment = compute_commitment(balance);

    // Attacker tries to use commitment as a nullifier
    let secret = 67890;
    let nonce = 111;
    let real_nullifier = compute_nullifier(commitment, secret, nonce);

    // Commitment and nullifier must be different due to domain separation
    assert(commitment == real_nullifier, "Commitment cannot be used as nullifier");
}

/// Attack: Mix commitment and nullifier domains
/// Expected: MUST FAIL - domain separators are distinct
#[test]
fn test_domain_separators_distinct() {
    // Verify domain separators are different
    assert(COMMITMENT_DOMAIN != NULLIFIER_DOMAIN, "Domain separators must be unique");

    // Verify they produce different hashes for same inputs
    let input1 = 100;
    let input2 = 200;
    let input3 = 300;
    let input4 = 400;

    let commitment_hash = Poseidon2::hash([COMMITMENT_DOMAIN, input1, input2, input3, input4], 5);
    let nullifier_hash = Poseidon2::hash([NULLIFIER_DOMAIN, input1, input2, input3, input4], 5);

    assert(commitment_hash != nullifier_hash, "Domain separation must prevent hash collision");
}

/// Attack: Construct commitment without domain separator
/// Expected: MUST FAIL - missing domain separator breaks binding
#[test(should_fail)]
fn test_missing_domain_separator_commitment() {
    let balance = Balance { owner: 11111, amount: 2000, vault_id: 0, blinding: 88888 };

    let correct_commitment = compute_commitment(balance);

    // Attacker computes hash without domain separator
    let tampered = Poseidon2::hash(
        [balance.owner, balance.amount, balance.vault_id, balance.blinding],
        4,
    );

    // Must be different from correct commitment
    assert(correct_commitment == tampered, "Domain separator is mandatory");
}

/// Attack: Construct nullifier without domain separator
/// Expected: MUST FAIL - missing domain separator breaks binding
#[test(should_fail)]
fn test_missing_domain_separator_nullifier() {
    let commitment = 12345;
    let secret = 67890;
    let nonce = 111;

    let correct_nullifier = compute_nullifier(commitment, secret, nonce);

    // Attacker computes hash without domain separator
    let tampered = Poseidon2::hash([commitment, secret, nonce], 3);

    assert(correct_nullifier == tampered, "Domain separator is mandatory");
}

/// Attack: Use wrong domain separator for commitment
/// Expected: MUST FAIL - wrong domain produces different hash
#[test(should_fail)]
fn test_wrong_domain_commitment() {
    let balance = Balance { owner: 11111, amount: 1500, vault_id: 0, blinding: 77777 };

    let correct = compute_commitment(balance);

    // Attacker uses nullifier domain for commitment
    let wrong_domain = Poseidon2::hash(
        [NULLIFIER_DOMAIN, balance.owner, balance.amount, balance.vault_id, balance.blinding],
        5,
    );

    assert(correct == wrong_domain, "Wrong domain separator must be rejected");
}

/// Attack: Use wrong domain separator for nullifier
/// Expected: MUST FAIL - wrong domain produces different hash
#[test(should_fail)]
fn test_wrong_domain_nullifier() {
    let commitment = 98765;
    let secret = 11111;
    let nonce = 222;

    let correct = compute_nullifier(commitment, secret, nonce);

    // Attacker uses commitment domain for nullifier
    let wrong_domain = Poseidon2::hash([COMMITMENT_DOMAIN, commitment, secret, nonce], 4);

    assert(correct == wrong_domain, "Wrong domain separator must be rejected");
}

/// Attack: Reorder inputs to bypass domain separation
/// Expected: MUST FAIL - domain is first input, reordering produces different hash
#[test(should_fail)]
fn test_domain_reordering_attack() {
    let balance = Balance { owner: 22222, amount: 3000, vault_id: 0, blinding: 66666 };

    let correct = compute_commitment(balance);

    // Attacker tries to move domain separator to different position
    let reordered = Poseidon2::hash(
        [balance.owner, COMMITMENT_DOMAIN, balance.amount, balance.vault_id, balance.blinding],
        5,
    );

    assert(correct == reordered, "Domain position is fixed");
}

/// Attack: Use custom domain separator
/// Expected: MUST FAIL - only protocol-defined domains are valid
#[test(should_fail)]
fn test_custom_domain_separator() {
    let custom_domain: Field = 0x99; // Attacker's custom domain
    let balance_data = [custom_domain, 11111, 1000, 0, 99999];
    let custom_commitment = Poseidon2::hash(balance_data, 5);

    let balance = Balance { owner: 11111, amount: 1000, vault_id: 0, blinding: 99999 };
    let correct_commitment = compute_commitment(balance);

    assert(custom_commitment == correct_commitment, "Custom domain must be rejected");
}

/// Attack: Cross-domain collision search
/// Expected: MUST FAIL - different domains produce non-colliding hashes
#[test]
fn test_cross_domain_collision_resistance() {
    // Try to find inputs that produce same hash across domains
    // This should be infeasible due to Poseidon2 collision resistance
    let inputs = [100, 200, 300, 400];

    let with_commitment_domain = Poseidon2::hash(
        [COMMITMENT_DOMAIN, inputs[0], inputs[1], inputs[2], inputs[3]],
        5,
    );
    let with_nullifier_domain = Poseidon2::hash(
        [NULLIFIER_DOMAIN, inputs[0], inputs[1], inputs[2], inputs[3]],
        5,
    );

    // Different domains must produce different outputs
    assert(with_commitment_domain != with_nullifier_domain, "Cross-domain collision detected");

    // Try different input variations
    let inputs2 = [101, 201, 301, 401];
    let commitment2 = Poseidon2::hash(
        [COMMITMENT_DOMAIN, inputs2[0], inputs2[1], inputs2[2], inputs2[3]],
        5,
    );

    assert(with_commitment_domain != commitment2, "Hash collision detected");
}

/// Attack: Use zero as domain separator
/// Expected: MUST FAIL - zero is not a valid domain
#[test(should_fail)]
fn test_zero_domain_separator() {
    let zero_domain: Field = 0;
    let balance_data = [zero_domain, 11111, 1000, 0, 99999];
    let zero_domain_commitment = Poseidon2::hash(balance_data, 5);

    let balance = Balance { owner: 11111, amount: 1000, vault_id: 0, blinding: 99999 };
    let correct_commitment = compute_commitment(balance);

    assert(zero_domain_commitment == correct_commitment, "Zero domain must be rejected");
}

/// Attack: Exploit domain separator in vault_id field
/// Expected: MUST FAIL - vault_id is separate field, domain is explicit
#[test(should_fail)]
fn test_vault_id_domain_confusion() {
    // Attacker sets vault_id to commitment domain value
    let balance_with_domain_vault = Balance {
        owner: 11111,
        amount: 1000,
        vault_id: COMMITMENT_DOMAIN, // Using domain as vault_id
        blinding: 99999,
    };

    let balance_normal = Balance { owner: 11111, amount: 1000, vault_id: 0, blinding: 99999 };

    let c1 = compute_commitment(balance_with_domain_vault);
    let c2 = compute_commitment(balance_normal);

    // Commitments must be different
    assert(c1 == c2, "Vault_id confusion with domain separator");
}

/// Attack: Length extension attack on domain-separated hash
/// Expected: MUST FAIL - Poseidon2 is not vulnerable to length extension
#[test]
fn test_length_extension_resistance() {
    // Commitment: H(domain || owner || amount || vault_id || blinding)
    let balance = Balance { owner: 11111, amount: 1000, vault_id: 0, blinding: 99999 };
    let commitment = compute_commitment(balance);

    // Attacker tries to extend the hash with additional data
    // Poseidon2 is a sponge function, resistant to length extension
    let extended_inputs = [
        COMMITMENT_DOMAIN,
        balance.owner,
        balance.amount,
        balance.vault_id,
        balance.blinding,
        123456,
    ];
    let extended_hash = Poseidon2::hash(extended_inputs, 6);

    // Extended hash must differ from original
    assert(commitment != extended_hash, "Length extension detected");
}

/// Attack: Domain separator at end instead of beginning
/// Expected: MUST FAIL - domain must be first input
#[test(should_fail)]
fn test_domain_at_end_attack() {
    let balance = Balance { owner: 33333, amount: 4000, vault_id: 0, blinding: 55555 };

    let correct = compute_commitment(balance);

    // Attacker puts domain at the end
    let domain_at_end = Poseidon2::hash(
        [balance.owner, balance.amount, balance.vault_id, balance.blinding, COMMITMENT_DOMAIN],
        5,
    );

    assert(correct == domain_at_end, "Domain must be first input");
}

/// Test: Verify domain separators are well-defined constants
#[test]
fn test_domain_constants_are_fixed() {
    // Domains must be specific, documented values
    assert(COMMITMENT_DOMAIN == 0x01, "Commitment domain must be 0x01");
    assert(NULLIFIER_DOMAIN == 0x02, "Nullifier domain must be 0x02");

    // Verify they're non-zero and distinct
    assert(COMMITMENT_DOMAIN != 0, "Domain must be non-zero");
    assert(NULLIFIER_DOMAIN != 0, "Domain must be non-zero");
    assert(COMMITMENT_DOMAIN != NULLIFIER_DOMAIN, "Domains must be distinct");
}
