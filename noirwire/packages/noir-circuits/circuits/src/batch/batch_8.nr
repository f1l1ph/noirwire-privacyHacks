#![allow(dead_code)]

// Batch circuit for aggregating exactly 8 proofs

struct BatchPublic {
    initial_root: Field,
    final_root: Field,
    batch_nullifiers: [Field; 8],
}

struct BatchPrivate {
    proof_data_1: [Field; 3],
    proof_data_2: [Field; 3],
    proof_data_3: [Field; 3],
    proof_data_4: [Field; 3],
    proof_data_5: [Field; 3],
    proof_data_6: [Field; 3],
    proof_data_7: [Field; 3],
    proof_data_8: [Field; 3],
}

fn main(public: BatchPublic, private: BatchPrivate) {
    // Verify chain continuity
    assert(private.proof_data_1[1] == public.initial_root);
    assert(private.proof_data_2[1] == private.proof_data_1[2]);
    assert(private.proof_data_3[1] == private.proof_data_2[2]);
    assert(private.proof_data_4[1] == private.proof_data_3[2]);
    assert(private.proof_data_5[1] == private.proof_data_4[2]);
    assert(private.proof_data_6[1] == private.proof_data_5[2]);
    assert(private.proof_data_7[1] == private.proof_data_6[2]);
    assert(private.proof_data_8[1] == private.proof_data_7[2]);
    assert(public.final_root == private.proof_data_8[2]);

    // Collect nullifiers
    assert(public.batch_nullifiers[0] == private.proof_data_1[0]);
    assert(public.batch_nullifiers[1] == private.proof_data_2[0]);
    assert(public.batch_nullifiers[2] == private.proof_data_3[0]);
    assert(public.batch_nullifiers[3] == private.proof_data_4[0]);
    assert(public.batch_nullifiers[4] == private.proof_data_5[0]);
    assert(public.batch_nullifiers[5] == private.proof_data_6[0]);
    assert(public.batch_nullifiers[6] == private.proof_data_7[0]);
    assert(public.batch_nullifiers[7] == private.proof_data_8[0]);
}
