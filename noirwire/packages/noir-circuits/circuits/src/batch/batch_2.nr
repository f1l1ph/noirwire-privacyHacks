// Batch circuit for aggregating exactly 2 proofs
// Verification Strategy: Hybrid recursive verification (RECOMMENDED for Solana)
// - Solana program verifies SNARK proofs using Groth16 verification
// - Batch circuit verifies state transitions (merkle roots, nullifiers)
// This separates proof cryptography (on-chain) from state logic (circuit)
//
// IMPORTANT: Individual proofs MUST be verified in Solana program before
// submitting state transitions to this batch circuit

struct BatchPublic {
    initial_root: Field,
    final_root: Field,
    batch_nullifiers: [Field; 2],
}

struct BatchPrivate {
    // Proof data: [nullifier, old_root, new_root]
    proof_data_1: [Field; 3],
    proof_data_2: [Field; 3],
}

fn main(public: BatchPublic, private: BatchPrivate) {
    // Extract proof components
    let nullifier_1 = private.proof_data_1[0];
    let old_root_1 = private.proof_data_1[1];
    let new_root_1 = private.proof_data_1[2];

    let nullifier_2 = private.proof_data_2[0];
    let old_root_2 = private.proof_data_2[1];
    let new_root_2 = private.proof_data_2[2];

    // Verify state chain continuity: initial -> root_1 -> final
    assert(old_root_1 == public.initial_root, "First proof old root must match initial");
    assert(old_root_2 == new_root_1, "Second proof old root must match first's new root");
    assert(new_root_2 == public.final_root, "Final root must match expected");

    // Collect and verify nullifiers
    assert(public.batch_nullifiers[0] == nullifier_1, "Nullifier 1 mismatch");
    assert(public.batch_nullifiers[1] == nullifier_2, "Nullifier 2 mismatch");
}

#[test]
fn test_batch_2() {
    let public = BatchPublic { initial_root: 1000, final_root: 1002, batch_nullifiers: [100, 101] };

    let private = BatchPrivate { proof_data_1: [100, 1000, 1001], proof_data_2: [101, 1001, 1002] };

    main(public, private);
}
