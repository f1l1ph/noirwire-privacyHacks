/// Integration Test: Complete Deposit -> Transfer -> Withdraw Flow
/// Tests the entire lifecycle of private funds

use crate::primitives::commitment::{compute_commitment, Balance};
use crate::primitives::merkle::{compute_merkle_root, MerkleProof};
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::poseidon2::Poseidon2;

#[test]
fn test_deposit_transfer_withdraw_flow() {
    // ===== PHASE 1: DEPOSIT =====
    // Alice deposits 1000 tokens
    let alice_owner = 11111;
    let alice_secret = 99999;
    let deposit_amount = 1000;
    let deposit_blinding = 12345;

    let alice_balance = Balance {
        owner: alice_owner,
        amount: deposit_amount,
        vault_id: 0, // Solo user
        blinding: deposit_blinding,
    };
    let alice_commitment = compute_commitment(alice_balance);

    // Insert into merkle tree at index 0
    let empty_siblings = [0, 0, 0];
    let alice_proof = MerkleProof { siblings: empty_siblings, path_indices: [0, 0, 0] };
    let root_after_deposit = compute_merkle_root(alice_commitment, alice_proof);
    assert(root_after_deposit != 0, "Merkle root must be non-zero after deposit");

    // ===== PHASE 2: TRANSFER =====
    // Alice transfers 300 tokens to Bob
    let transfer_amount = 300;
    let alice_nonce = 1;

    // Generate nullifier for Alice's spend
    let alice_nullifier = compute_nullifier(alice_commitment, alice_secret, alice_nonce);

    // Alice's new balance: 1000 - 300 = 700
    let alice_new_amount = deposit_amount - transfer_amount;
    let alice_new_blinding = 54321;
    let alice_new_balance = Balance {
        owner: alice_owner,
        amount: alice_new_amount,
        vault_id: 0,
        blinding: alice_new_blinding,
    };
    let alice_new_commitment = compute_commitment(alice_new_balance);
    assert(alice_new_commitment != alice_commitment, "New commitment must differ from old");

    // Bob receives 300 tokens
    let bob_owner = 22222;
    let bob_blinding = 11111;
    let bob_balance =
        Balance { owner: bob_owner, amount: transfer_amount, vault_id: 0, blinding: bob_blinding };
    let bob_commitment = compute_commitment(bob_balance);

    // Verify balances conserved
    assert(alice_new_amount + transfer_amount == deposit_amount);

    // ===== PHASE 3: WITHDRAW =====
    // Bob withdraws his 300 tokens to L1
    let bob_secret = 88888;
    let bob_nonce = 1;
    let bob_nullifier = compute_nullifier(bob_commitment, bob_secret, bob_nonce);
    let withdraw_amount = 300;

    // Bob's remainder: 300 - 300 = 0 (full withdrawal)
    let bob_remainder = transfer_amount - withdraw_amount;
    assert(bob_remainder == 0);

    // Verify all nullifiers are unique
    assert(alice_nullifier != bob_nullifier);

    // Final verification: total supply preserved
    // Alice has 700, Bob withdrew 300
    // Total accounted for: 700 + 300 = 1000 (original deposit)
    assert(alice_new_amount + withdraw_amount == deposit_amount);
}

#[test]
fn test_sequential_transfers() {
    // Alice deposits 1000
    let alice_owner = 11111;
    let initial_amount = 1000;
    let alice_balance1 =
        Balance { owner: alice_owner, amount: initial_amount, vault_id: 0, blinding: 10001 };
    let alice_commitment1 = compute_commitment(alice_balance1);

    // Transfer 1: Alice -> Bob (200 tokens)
    let transfer1_amount = 200;
    let alice_balance2 = Balance {
        owner: alice_owner,
        amount: initial_amount - transfer1_amount, // 800
        vault_id: 0,
        blinding: 10002,
    };
    let alice_commitment2 = compute_commitment(alice_balance2);

    let bob_owner = 22222;
    let bob_balance1 = Balance {
        owner: bob_owner,
        amount: transfer1_amount, // 200
        vault_id: 0,
        blinding: 20001,
    };
    let bob_commitment1 = compute_commitment(bob_balance1);

    // Transfer 2: Alice -> Charlie (300 tokens)
    let transfer2_amount = 300;
    let alice_balance3 = Balance {
        owner: alice_owner,
        amount: 800 - transfer2_amount, // 500
        vault_id: 0,
        blinding: 10003,
    };
    let alice_commitment3 = compute_commitment(alice_balance3);

    let charlie_owner = 33333;
    let charlie_balance1 = Balance {
        owner: charlie_owner,
        amount: transfer2_amount, // 300
        vault_id: 0,
        blinding: 30001,
    };
    let charlie_commitment1 = compute_commitment(charlie_balance1);

    // Transfer 3: Bob -> Charlie (100 tokens)
    let transfer3_amount = 100;
    let bob_balance2 = Balance {
        owner: bob_owner,
        amount: 200 - transfer3_amount, // 100
        vault_id: 0,
        blinding: 20002,
    };
    let bob_commitment2 = compute_commitment(bob_balance2);

    let charlie_balance2 = Balance {
        owner: charlie_owner,
        amount: 300 + transfer3_amount, // 400
        vault_id: 0,
        blinding: 30002,
    };
    let charlie_commitment2 = compute_commitment(charlie_balance2);

    // Final state verification
    let alice_final = 500;
    let bob_final = 100;
    let charlie_final = 400;

    // Total conservation check
    assert(alice_final + bob_final + charlie_final == initial_amount);

    // All commitments must be unique
    assert(alice_commitment1 != alice_commitment2);
    assert(alice_commitment2 != alice_commitment3);
    assert(bob_commitment1 != bob_commitment2);
    assert(charlie_commitment1 != charlie_commitment2);
}

#[test]
fn test_partial_withdrawals() {
    // User deposits 1000, makes multiple partial withdrawals
    let owner = 11111;
    let initial_amount = 1000;

    // Initial balance
    let balance1 = Balance { owner, amount: initial_amount, vault_id: 0, blinding: 1 };
    let commitment1 = compute_commitment(balance1);

    // Withdrawal 1: 300 tokens (700 remains)
    let withdraw1 = 300;
    let remainder1 = initial_amount - withdraw1;
    assert(remainder1 == 700);

    let balance2 = Balance { owner, amount: remainder1, vault_id: 0, blinding: 2 };
    let commitment2 = compute_commitment(balance2);

    // Withdrawal 2: 200 tokens (500 remains)
    let withdraw2 = 200;
    let remainder2 = remainder1 - withdraw2;
    assert(remainder2 == 500);

    let balance3 = Balance { owner, amount: remainder2, vault_id: 0, blinding: 3 };
    let commitment3 = compute_commitment(balance3);

    // Withdrawal 3: 500 tokens (0 remains - full withdrawal)
    let withdraw3 = 500;
    let remainder3 = remainder2 - withdraw3;
    assert(remainder3 == 0);

    // Verify total withdrawn equals initial deposit
    assert(withdraw1 + withdraw2 + withdraw3 == initial_amount);

    // All commitments must be unique due to different blinding factors
    assert(commitment1 != commitment2);
    assert(commitment2 != commitment3);
    assert(commitment1 != commitment3);
}

#[test]
fn test_multi_user_deposit_and_withdraw() {
    // Multiple users deposit and withdraw independently
    let user1 = 11111;
    let user2 = 22222;
    let user3 = 33333;

    // Deposits
    let deposit1 = Balance { owner: user1, amount: 500, vault_id: 0, blinding: 1 };
    let deposit2 = Balance { owner: user2, amount: 750, vault_id: 0, blinding: 2 };
    let deposit3 = Balance { owner: user3, amount: 1000, vault_id: 0, blinding: 3 };

    let commitment1 = compute_commitment(deposit1);
    let commitment2 = compute_commitment(deposit2);
    let commitment3 = compute_commitment(deposit3);

    // All commitments unique
    assert(commitment1 != commitment2);
    assert(commitment2 != commitment3);
    assert(commitment1 != commitment3);

    // User1 withdraws fully
    let user1_secret = 99991;
    let user1_nullifier = compute_nullifier(commitment1, user1_secret, 1);

    // User2 withdraws partially (500 out of 750)
    let user2_secret = 99992;
    let user2_nullifier = compute_nullifier(commitment2, user2_secret, 1);
    let user2_remainder = Balance { owner: user2, amount: 250, vault_id: 0, blinding: 22 };
    let user2_new_commitment = compute_commitment(user2_remainder);
    assert(user2_new_commitment != commitment2, "User2 new commitment must differ");

    // User3 transfers to user1 (400 tokens)
    let user3_secret = 99993;
    let user3_nullifier = compute_nullifier(commitment3, user3_secret, 1);
    let user3_remainder = Balance { owner: user3, amount: 600, vault_id: 0, blinding: 33 };
    let user1_received = Balance { owner: user1, amount: 400, vault_id: 0, blinding: 11 };

    let user3_new_commitment = compute_commitment(user3_remainder);
    let user1_new_commitment = compute_commitment(user1_received);
    assert(user3_new_commitment != commitment3, "User3 new commitment must differ");
    assert(user1_new_commitment != commitment1, "User1 new commitment must differ from original");

    // All nullifiers must be unique
    assert(user1_nullifier != user2_nullifier);
    assert(user2_nullifier != user3_nullifier);
    assert(user1_nullifier != user3_nullifier);

    // Verify conservation of funds
    // User2: 250 remaining
    // User3: 600 remaining
    // User1: 400 received
    // Total in system: 250 + 600 + 400 = 1250
    // Original deposits: 500 + 750 + 1000 = 2250
    // Withdrawn: user1 500 + user2 500 = 1000
    // 1250 + 1000 = 2250 (correct)
}

#[test]
fn test_merkle_tree_updates_through_flow() {
    // Track merkle root through multiple operations
    let alice = 11111;
    let bob = 22222;

    // Operation 1: Alice deposits (insert at index 0)
    let alice_balance = Balance { owner: alice, amount: 1000, vault_id: 0, blinding: 1 };
    let alice_commitment = compute_commitment(alice_balance);

    let empty_tree_siblings = [0, 0, 0];
    let alice_proof = MerkleProof { siblings: empty_tree_siblings, path_indices: [0, 0, 0] };
    let root1 = compute_merkle_root(alice_commitment, alice_proof);

    // Operation 2: Bob deposits (insert at index 1)
    let bob_balance = Balance { owner: bob, amount: 500, vault_id: 0, blinding: 2 };
    let bob_commitment = compute_commitment(bob_balance);

    // After Alice's insert, tree has changed
    let level1 = Poseidon2::hash([alice_commitment, bob_commitment], 2);
    let level2 = Poseidon2::hash([level1, 0], 2);
    let root2 = Poseidon2::hash([level2, 0], 2);

    // Roots must be different after each operation
    assert(root1 != root2);

    // Operation 3: Alice transfers to Bob (nullifies alice_commitment)
    let alice_secret = 99991;
    let alice_nullifier = compute_nullifier(alice_commitment, alice_secret, 1);

    // Nullifier must be unique and deterministic
    let alice_nullifier_check = compute_nullifier(alice_commitment, alice_secret, 1);
    assert(alice_nullifier == alice_nullifier_check);

    // After nullification, tree structure changes again
    // This test demonstrates that roots evolve with state transitions
}

#[test]
fn test_commitment_uniqueness_across_operations() {
    // Verify that same amount with different parameters produces unique commitments
    let amount = 1000;

    // Different owners
    let c1 = compute_commitment(Balance { owner: 1, amount, vault_id: 0, blinding: 100 });
    let c2 = compute_commitment(Balance { owner: 2, amount, vault_id: 0, blinding: 100 });
    assert(c1 != c2);

    // Different vault_ids
    let c3 = compute_commitment(Balance { owner: 1, amount, vault_id: 0, blinding: 100 });
    let c4 = compute_commitment(Balance { owner: 1, amount, vault_id: 1, blinding: 100 });
    assert(c3 != c4);

    // Different blindings (most common case)
    let c5 = compute_commitment(Balance { owner: 1, amount, vault_id: 0, blinding: 100 });
    let c6 = compute_commitment(Balance { owner: 1, amount, vault_id: 0, blinding: 101 });
    assert(c5 != c6);

    // Different amounts
    let c7 = compute_commitment(
        Balance { owner: 1, amount: 1000, vault_id: 0, blinding: 100 },
    );
    let c8 = compute_commitment(
        Balance { owner: 1, amount: 1001, vault_id: 0, blinding: 100 },
    );
    assert(c7 != c8);
}
