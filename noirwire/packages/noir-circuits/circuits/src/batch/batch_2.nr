#![allow(dead_code)]

// Batch circuit for aggregating exactly 2 proofs

struct BatchPublic {
    initial_root: Field,
    final_root: Field,
    batch_nullifiers: [Field; 2],
}

struct BatchPrivate {
    proof_data_1: [Field; 3], // [nullifier, old_root, new_root]
    proof_data_2: [Field; 3],
}

fn main(public: BatchPublic, private: BatchPrivate) {
    // Verify chain continuity
    assert(private.proof_data_1[1] == public.initial_root);
    assert(private.proof_data_2[1] == private.proof_data_1[2]);
    assert(public.final_root == private.proof_data_2[2]);

    // Collect nullifiers
    assert(public.batch_nullifiers[0] == private.proof_data_1[0]);
    assert(public.batch_nullifiers[1] == private.proof_data_2[0]);
}
