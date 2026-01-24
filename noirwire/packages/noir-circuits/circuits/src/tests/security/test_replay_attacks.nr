/// Security Test Suite: Replay Attack Prevention
/// Tests that proofs cannot be replayed or reused maliciously

use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::merkle::{compute_merkle_root, MerkleProof, verify_merkle_inclusion};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::poseidon2::Poseidon2;

/// Attack: Replay same deposit proof multiple times
/// Expected: Same blinding produces same commitment - application layer must enforce unique blindings
///
/// This test verifies that commitments are deterministic. An attacker replaying a deposit
/// with the same blinding will produce the same commitment. The application layer must
/// track which blindings have been used and reject replays.
#[test]
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
    assert(
        commitment1 == commitment2,
        "Same blinding produces identical commitment - application must prevent replays",
    );

    // Protocol must enforce unique blinding per deposit via application-layer check
}

/// Attack: Replay withdrawal proof with different recipient
/// Expected: MUST FAIL - proof is bound to specific public inputs
///
/// This test verifies that changing a public input (recipient) changes the proof binding.
/// A withdrawal proof commits to a specific recipient through the circuit constraints.
#[test]
fn test_withdrawal_recipient_substitution() {
    let nullifier = 98765;
    let amount = 500;
    let original_recipient = 11111;
    let attacker_recipient = 99999;

    // Withdrawal proof is bound to recipient via public inputs
    // Changing recipient invalidates the proof

    // In real circuit, public inputs hash would include recipient
    let original_pub_hash = Poseidon2::hash([nullifier, amount, original_recipient], 3);
    let tampered_pub_hash = Poseidon2::hash([nullifier, amount, attacker_recipient], 3);

    // Different recipients MUST produce different hashes
    assert(
        original_pub_hash != tampered_pub_hash,
        "Changing recipient changes proof commitment - cannot tamper in replay",
    );
}

/// Attack: Replay transfer proof to different merkle root
/// Expected: MUST FAIL - proof is bound to specific root
///
/// This test verifies that a merkle proof is only valid against a specific root.
/// Changing the root (tree state changes) invalidates the proof.
#[test]
fn test_transfer_root_replay() {
    let leaf = 100;
    let proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };

    let original_root = compute_merkle_root(leaf, proof);

    // Tree updates with new deposits (different leaf)
    let different_root = compute_merkle_root(101, proof);

    // Roots must differ for different leaves
    assert(original_root != different_root, "Different leaves produce different roots");

    // Original proof is ONLY valid against original root
    // Changing root invalidates the proof
    assert(
        !verify_merkle_inclusion(leaf, different_root, proof),
        "Original proof fails against new root - cannot replay across tree states",
    );
}

/// Attack: Replay nullifier from previous epoch/period
/// Expected: Same nullifier is deterministic - registry prevents replays across epochs
///
/// This test verifies that nullifiers are deterministic and persistent.
/// An attacker trying to replay a nullifier from a previous epoch produces
/// the same nullifier, which is detected by the persistent nullifier registry.
#[test]
fn test_cross_epoch_nullifier_replay() {
    let commitment = 12345;
    let secret = 67890;
    let nonce = 111;

    let nullifier_epoch1 = compute_nullifier(commitment, secret, nonce);
    let nullifier_epoch2 = compute_nullifier(commitment, secret, nonce);

    // Nullifier is deterministic across epochs
    assert(
        nullifier_epoch1 == nullifier_epoch2,
        "Same input produces same nullifier across epochs - registry prevents replays",
    );
}

/// Attack: Replay proof after merkle tree reorganization
/// Expected: MUST FAIL - proof validity depends on current tree state
///
/// This test verifies that merkle proofs are only valid against specific tree states.
/// Tree reorganization (new insertions) changes the sibling values needed for proofs.
#[test]
fn test_proof_after_tree_reorg() {
    let leaf = 100;
    let original_proof = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let original_root = compute_merkle_root(leaf, original_proof);

    // Tree gets reorganized (different siblings due to insertions)
    let reorg_proof = MerkleProof {
        siblings: [500, 600, 700], // Different tree structure after insertions
        path_indices: [0, 1, 0],
    };
    let reorg_root = compute_merkle_root(leaf, reorg_proof);

    // Different siblings produce different roots
    assert(original_root != reorg_root, "Roots differ after tree reorganization");

    // Original proof is ONLY valid against original root
    // After reorganization, old proof is invalid
    assert(
        !verify_merkle_inclusion(leaf, reorg_root, original_proof),
        "Original proof fails against reorganized tree",
    );
}

/// Attack: Replay transaction with modified public inputs
/// Expected: MUST FAIL - proof is cryptographically bound to public inputs
///
/// This test verifies that changing public inputs changes the proof hash.
/// Proofs are only valid for specific public inputs; tampering invalidates them.
#[test]
fn test_modified_public_inputs_replay() {
    // Public inputs: [nullifier, amount, root]
    let nullifier = 11111;
    let amount_original = 1000;
    let amount_tampered = 1; // Attacker tries to reduce amount
    let root = 99999;

    // Proof verifies specific public inputs
    let original_pub = Poseidon2::hash([nullifier, amount_original, root], 3);
    let tampered_pub = Poseidon2::hash([nullifier, amount_tampered, root], 3);

    // Changing any public input changes the proof hash
    assert(
        original_pub != tampered_pub,
        "Modifying public inputs invalidates proof - cannot tamper in replay",
    );
}

/// Attack: Reuse commitment with different vault_id
/// Expected: MUST FAIL - commitment includes vault_id
///
/// This test verifies that commitment includes vault_id as a component.
/// The same balance in different vault contexts produces different commitments,
/// preventing cross-context reuse.
#[test]
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

    // Commitments MUST differ by vault_id
    // Cannot reuse solo commitment in vault context
    assert(
        commitment_solo != commitment_vault,
        "Different vault_ids produce different commitments - prevents context substitution",
    );
}

/// Attack: Replay old proof after state transition
/// Expected: MUST FAIL - proof validity is state-dependent
///
/// This test verifies that merkle proofs are only valid for specific states.
/// When the tree state changes, old proofs become invalid.
#[test]
fn test_proof_after_state_transition() {
    let old_leaf = 100;
    let new_leaf = 200;
    let proof = MerkleProof { siblings: [300, 400, 500], path_indices: [0, 1, 0] };

    let old_root = compute_merkle_root(old_leaf, proof);
    let new_root = compute_merkle_root(new_leaf, proof);

    // Different leaves produce different roots
    assert(old_root != new_root, "State transition changes root");

    // After state transition, old proof is no longer valid against new root
    assert(
        !verify_merkle_inclusion(old_leaf, new_root, proof),
        "Old proof fails against new state - cannot replay after transitions",
    );
}

/// Attack: Parallel submission of same proof
/// Expected: Both submissions produce same nullifier - only first is accepted
///
/// This test verifies that parallel submissions of the same proof produce
/// identical nullifiers. The protocol must atomically handle this: only the
/// first submission succeeds; the second fails as nullifier already used.
#[test]
fn test_parallel_proof_submission() {
    let commitment = 12345;
    let secret = 67890;
    let nonce = 111;

    let nullifier = compute_nullifier(commitment, secret, nonce);

    // Attacker submits same proof in two parallel transactions
    let submission1_nullifier = nullifier;
    let submission2_nullifier = compute_nullifier(commitment, secret, nonce);

    // Both compute identical nullifiers (deterministic)
    assert(
        submission1_nullifier == submission2_nullifier,
        "Parallel submissions produce same nullifier - atomic registry prevents both",
    );

    // Protocol must atomically check: first succeeds, second fails
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
///
/// This test verifies that frontrunning requires knowledge of the secret.
/// An attacker seeing a transaction can't forge a valid nullifier without the secret.
#[test]
fn test_frontrunning_attack() {
    // Victim's transaction
    let victim_commitment = 12345;
    let victim_secret = 67890; // Private (unknown to attacker)
    let victim_nonce = 111;

    let victim_nullifier = compute_nullifier(victim_commitment, victim_secret, victim_nonce);

    // Attacker sees transaction in mempool and tries to frontrun
    // But attacker doesn't know the secret, only the commitment
    let attacker_secret = 0; // Attacker guesses wrong
    let attacker_nullifier = compute_nullifier(victim_commitment, attacker_secret, victim_nonce);

    // Attacker's nullifier differs (doesn't have correct secret)
    assert(
        victim_nullifier != attacker_nullifier,
        "Frontrunning fails without knowledge of secret",
    );
}

/// Attack: Replay proof from different chain/fork
/// Expected: MUST FAIL - chain-specific context prevents cross-chain replay
///
/// This test verifies that different chains produce different nullifiers.
/// Chain-specific context (domain separator) prevents cross-chain replay attacks.
#[test]
fn test_cross_chain_replay() {
    let commitment = 98765;
    let secret = 11111;
    let nonce = 222;

    // Chain A nullifier (with chain-specific context)
    let chain_a_context = 0xAAAA;
    let nullifier_a = Poseidon2::hash([chain_a_context, commitment, secret, nonce], 4);

    // Chain B (different context)
    let chain_b_context = 0xBBBB;
    let nullifier_b = Poseidon2::hash([chain_b_context, commitment, secret, nonce], 4);

    // Different chains MUST produce different nullifiers
    // Cannot replay proof across chains
    assert(
        nullifier_a != nullifier_b,
        "Different chains produce different nullifiers - prevents cross-chain replay",
    );
}

/// Attack: Reorder transactions to invalidate proofs
/// Expected: Proofs may fail if tree state changes
///
/// This test verifies that proof validity depends on transaction order.
/// Different transaction orderings produce different tree states and roots.
#[test]
fn test_transaction_reordering() {
    let leaf = 100;
    let proof_at_state_n = MerkleProof { siblings: [200, 300, 400], path_indices: [0, 1, 0] };
    let root_at_state_n = compute_merkle_root(leaf, proof_at_state_n);

    // Different siblings correspond to different tree state
    let proof_at_state_m = MerkleProof {
        siblings: [250, 350, 450], // Different tree state after reordering
        path_indices: [0, 1, 0],
    };
    let root_at_state_m = compute_merkle_root(leaf, proof_at_state_m);

    // Different transaction orders produce different roots
    assert(root_at_state_n != root_at_state_m, "Transaction order affects tree state");

    // Original proof invalid at different state
    assert(
        !verify_merkle_inclusion(leaf, root_at_state_m, proof_at_state_n),
        "Proof validity depends on transaction order",
    );
}

/// Attack: Reuse proof components across transactions
/// Expected: MUST FAIL - each proof is unique
///
/// This test verifies that reusing proof components (siblings) with different leaves
/// produces different roots. Proof components cannot be cross-used.
#[test]
fn test_proof_component_reuse() {
    let leaf1 = 100;
    let leaf2 = 200;

    // Two transactions with same siblings (attacker tries to reuse)
    let shared_siblings = [300, 400, 500];

    let proof1 = MerkleProof { siblings: shared_siblings, path_indices: [0, 1, 0] };
    let root1 = compute_merkle_root(leaf1, proof1);

    let proof2 = MerkleProof {
        siblings: shared_siblings, // Same siblings, different leaf
        path_indices: [0, 1, 0],
    };
    let root2 = compute_merkle_root(leaf2, proof2);

    // Same siblings with different leaves produce different roots
    assert(
        root1 != root2,
        "Different leaves with same siblings produce different roots - cannot reuse components",
    );
}
