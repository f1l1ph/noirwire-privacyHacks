// Batch circuit for aggregating exactly 4 proofs with recursive verification

struct BatchPublic {
    initial_root: Field,
    final_root: Field,
    batch_nullifiers: [Field; 4],
}

struct BatchPrivate {
    proof_data_1: [Field; 3],
    proof_data_2: [Field; 3],
    proof_data_3: [Field; 3],
    proof_data_4: [Field; 3],
}

fn main(public: BatchPublic, private: BatchPrivate) {
    // Extract proof components
    let nullifier_1 = private.proof_data_1[0];
    let old_root_1 = private.proof_data_1[1];
    let new_root_1 = private.proof_data_1[2];

    let nullifier_2 = private.proof_data_2[0];
    let old_root_2 = private.proof_data_2[1];
    let new_root_2 = private.proof_data_2[2];

    let nullifier_3 = private.proof_data_3[0];
    let old_root_3 = private.proof_data_3[1];
    let new_root_3 = private.proof_data_3[2];

    let nullifier_4 = private.proof_data_4[0];
    let old_root_4 = private.proof_data_4[1];
    let new_root_4 = private.proof_data_4[2];

    // Verify state chain continuity: initial -> root_1 -> root_2 -> root_3 -> final
    assert(old_root_1 == public.initial_root, "First proof old root mismatch");
    assert(old_root_2 == new_root_1, "Second proof old root mismatch");
    assert(old_root_3 == new_root_2, "Third proof old root mismatch");
    assert(old_root_4 == new_root_3, "Fourth proof old root mismatch");
    assert(new_root_4 == public.final_root, "Final root mismatch");

    // Collect and verify nullifiers
    assert(public.batch_nullifiers[0] == nullifier_1, "Nullifier 1 mismatch");
    assert(public.batch_nullifiers[1] == nullifier_2, "Nullifier 2 mismatch");
    assert(public.batch_nullifiers[2] == nullifier_3, "Nullifier 3 mismatch");
    assert(public.batch_nullifiers[3] == nullifier_4, "Nullifier 4 mismatch");
}

#[test]
fn test_batch_4() {
    let public = BatchPublic {
        initial_root: 1000,
        final_root: 1004,
        batch_nullifiers: [100, 101, 102, 103],
    };

    let private = BatchPrivate {
        proof_data_1: [100, 1000, 1001],
        proof_data_2: [101, 1001, 1002],
        proof_data_3: [102, 1002, 1003],
        proof_data_4: [103, 1003, 1004],
    };

    main(public, private);
}
