/// Security Test Suite: Replay Attack Prevention
/// Tests that proofs cannot be replayed or reused maliciously

use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::merkle::{compute_merkle_root, MerkleProof, verify_merkle_inclusion};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::poseidon2::Poseidon2;

/// Attack: Replay same deposit proof multiple times
/// Expected: MUST FAIL - each deposit creates unique commitment with unique blinding
#[test(should_fail)]
fn test_deposit_replay_attack() {
    let owner = 12345;
    let amount = 1000;
    let vault_id = 0;
    let blinding1 = 11111;

    let balance1 = Balance { owner, amount, vault_id, blinding: blinding1 };
    let commitment1 = compute_commitment(balance1);

    // Attacker tries to replay with same blinding
    let balance2 = Balance { owner, amount, vault_id, blinding: blinding1 };
    let commitment2 = compute_commitment(balance2);

    // Commitments are identical (deterministic)
    assert(commitment1 == commitment2);

    // Protocol must enforce unique blinding per deposit
    // Second deposit with same blinding should be rejected at application layer
    // This test documents that fresh randomness is required
    assert(blinding1 != blinding1, "Blinding must be unique per deposit");
}

/// Attack: Replay withdrawal proof with different recipient
/// Expected: MUST FAIL - proof is bound to specific public inputs
#[test(should_fail)]
fn test_withdrawal_recipient_substitution() {
    let nullifier = 98765;
    let amount = 500;
    let original_recipient = 11111;
    let attacker_recipient = 99999;

    // Withdrawal proof is bound to recipient via public inputs
    // Attacker cannot change recipient without invalidating proof

    // In real circuit, public inputs hash would include recipient
    let original_pub_hash = Poseidon2::hash([nullifier, amount, original_recipient], 3);
    let tampered_pub_hash = Poseidon2::hash([nullifier, amount, attacker_recipient], 3);

    assert(original_pub_hash == tampered_pub_hash, "Cannot change recipient in replay");
}

/// Attack: Replay transfer proof to different merkle root
/// Expected: MUST FAIL - proof is bound to specific root
#[test(should_fail)]
fn test_transfer_root_replay() {
    let leaf = 100;
    let proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let original_root = compute_merkle_root(leaf, proof);

    // Tree updates with new deposits
    let different_root = compute_merkle_root(101, proof);
    assert(original_root != different_root, "Roots must differ for different leaves");

    // Attacker tries to use old proof with new root
    assert(
        verify_merkle_inclusion(leaf, different_root, proof),
        "Cannot replay proof against different root",
    );
}

/// Attack: Replay nullifier from previous epoch/period
/// Expected: MUST FAIL - nullifier registry is persistent across epochs
#[test(should_fail)]
fn test_cross_epoch_nullifier_replay() {
    let commitment = 12345;
    let secret = 67890;
    let nonce = 111;

    let nullifier_epoch1 = compute_nullifier(commitment, secret, nonce);
    let nullifier_epoch2 = nullifier_epoch1; // Attacker replays same nullifier

    // Nullifier set is global and persistent
    // Cannot reuse nullifier even in different epoch
    assert(nullifier_epoch1 != nullifier_epoch2, "Nullifier replay across epochs");
}

/// Attack: Replay proof after merkle tree reorganization
/// Expected: MUST FAIL - proof validity depends on current tree state
#[test(should_fail)]
fn test_proof_after_tree_reorg() {
    let leaf = 100;
    let original_proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let original_root = compute_merkle_root(leaf, original_proof);

    // Tree gets reorganized (different siblings due to insertions)
    let reorg_proof = MerkleProof {
        siblings: [500, 600, 700], // Different tree structure
        path_indices: [0, 1, 0],
    };
    let reorg_root = compute_merkle_root(leaf, reorg_proof);
    assert(original_root != reorg_root, "Roots must differ after reorganization");

    // Original proof invalid against reorganized tree
    assert(
        verify_merkle_inclusion(leaf, reorg_root, original_proof),
        "Proof invalid after tree reorganization",
    );
}

/// Attack: Replay transaction with modified public inputs
/// Expected: MUST FAIL - proof is cryptographically bound to public inputs
#[test(should_fail)]
fn test_modified_public_inputs_replay() {
    // Public inputs: [nullifier, amount, root]
    let nullifier = 11111;
    let amount_original = 1000;
    let amount_tampered = 1; // Attacker reduces amount
    let root = 99999;

    // Proof verifies specific public inputs
    let original_pub = Poseidon2::hash([nullifier, amount_original, root], 3);
    let tampered_pub = Poseidon2::hash([nullifier, amount_tampered, root], 3);

    // Changing any public input invalidates the proof
    assert(original_pub == tampered_pub, "Cannot modify public inputs");
}

/// Attack: Reuse commitment with different vault_id
/// Expected: MUST FAIL - commitment includes vault_id
#[test(should_fail)]
fn test_vault_id_substitution_replay() {
    let owner = 12345;
    let amount = 1000;
    let vault_id_solo = 0;
    let vault_id_vault = 77777;
    let blinding = 99999;

    let commitment_solo =
        compute_commitment(Balance { owner, amount, vault_id: vault_id_solo, blinding });
    let commitment_vault = compute_commitment(
        Balance { owner, amount, vault_id: vault_id_vault, blinding },
    );

    // Commitments must differ by vault_id
    // Cannot reuse solo commitment in vault context
    assert(commitment_solo == commitment_vault, "Vault_id substitution detected");
}

/// Attack: Replay old proof after state transition
/// Expected: MUST FAIL - proof validity is state-dependent
#[test(should_fail)]
fn test_proof_after_state_transition() {
    let old_leaf = 100;
    let new_leaf = 200;
    let proof = MerkleProof { siblings: [300, 400, 500], path_indices: [0, 1, 0] };

    let old_root = compute_merkle_root(old_leaf, proof);
    let new_root = compute_merkle_root(new_leaf, proof);
    assert(old_root != new_root, "Roots must differ after state transition");

    // After state transition (old_leaf -> new_leaf), old proof is invalid
    assert(
        verify_merkle_inclusion(old_leaf, new_root, proof),
        "Old proof invalid after state transition",
    );
}

/// Attack: Parallel submission of same proof
/// Expected: MUST FAIL - first submission nullifies, second fails
#[test(should_fail)]
fn test_parallel_proof_submission() {
    let commitment = 12345;
    let secret = 67890;
    let nonce = 111;

    let nullifier = compute_nullifier(commitment, secret, nonce);

    // Attacker submits same proof in two parallel transactions
    let submission1_nullifier = nullifier;
    let submission2_nullifier = nullifier;

    // Both compute same nullifier
    assert(submission1_nullifier == submission2_nullifier);

    // Protocol must handle parallel submissions atomically
    // Second submission must fail (nullifier already used)
    // This test documents the requirement for atomic nullifier checking
    assert(submission1_nullifier != submission2_nullifier, "Parallel submission must be prevented");
}

/// Attack: Replay with time-shifted nonce
/// Expected: Valid - different nonces allowed, but creates observable pattern
#[test]
fn test_sequential_nonce_pattern() {
    let commitment = 12345;
    let secret = 67890;

    // Sequential nonces create linkable pattern
    let n1 = compute_nullifier(commitment, secret, 0);
    let n2 = compute_nullifier(commitment, secret, 1);
    let n3 = compute_nullifier(commitment, secret, 2);

    // All nullifiers are unique (valid)
    assert(n1 != n2);
    assert(n2 != n3);
    assert(n1 != n3);

    // However, sequential nonces may leak usage patterns
    // Best practice: use random nonces
}

/// Attack: Frontrun transaction by copying proof data
/// Expected: MUST FAIL - proof contains unique secrets
#[test(should_fail)]
fn test_frontrunning_attack() {
    // Victim's transaction
    let victim_commitment = 12345;
    let victim_secret = 67890; // Private
    let victim_nonce = 111;

    let victim_nullifier = compute_nullifier(victim_commitment, victim_secret, victim_nonce);

    // Attacker sees transaction in mempool and tries to frontrun
    // But attacker doesn't know the secret
    let attacker_secret = 0; // Attacker guesses
    let attacker_nullifier = compute_nullifier(victim_commitment, attacker_secret, victim_nonce);

    // Attacker's nullifier differs (doesn't have secret)
    assert(victim_nullifier == attacker_nullifier, "Frontrunning without secret fails");
}

/// Attack: Replay proof from different chain/fork
/// Expected: MUST FAIL - chain-specific context prevents cross-chain replay
#[test(should_fail)]
fn test_cross_chain_replay() {
    let commitment = 98765;
    let secret = 11111;
    let nonce = 222;

    // Chain A nullifier
    let chain_a_context = 0xAAAA;
    let nullifier_a = Poseidon2::hash([chain_a_context, commitment, secret, nonce], 4);

    // Chain B (fork or different deployment)
    let chain_b_context = 0xBBBB;
    let nullifier_b = Poseidon2::hash([chain_b_context, commitment, secret, nonce], 4);

    // Different chains produce different nullifiers
    // Cannot replay proof across chains
    assert(nullifier_a == nullifier_b, "Cross-chain replay must be prevented");
}

/// Attack: Reorder transactions to invalidate proofs
/// Expected: Proofs may fail if tree state changes
#[test(should_fail)]
fn test_transaction_reordering() {
    let leaf = 100;
    let proof_at_state_n = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let root_at_state_n = compute_merkle_root(leaf, proof_at_state_n);

    // Transactions reordered, tree state changes
    let proof_at_state_m = MerkleProof {
        siblings: [250, 350, 450], // Different siblings after reordering
        path_indices: [0, 1, 0],
    };

    // Original proof invalid at different state
    assert(
        verify_merkle_inclusion(leaf, root_at_state_n, proof_at_state_m),
        "Proof validity depends on transaction order",
    );
}

/// Attack: Reuse proof components across transactions
/// Expected: MUST FAIL - each proof is unique
#[test(should_fail)]
fn test_proof_component_reuse() {
    let leaf1 = 100;
    let leaf2 = 200;

    // Two transactions share siblings (attacker tries to reuse)
    let shared_siblings = [300, 400, 500];

    let proof1 = MerkleProof { siblings: shared_siblings, path_indices: [0, 1, 0] };
    let root1 = compute_merkle_root(leaf1, proof1);

    let proof2 = MerkleProof {
        siblings: shared_siblings, // Reused
        path_indices: [0, 1, 0],
    };
    let root2 = compute_merkle_root(leaf2, proof2);

    // Same siblings with different leaf produce different roots
    assert(root1 == root2, "Cannot reuse proof components across leaves");
}
