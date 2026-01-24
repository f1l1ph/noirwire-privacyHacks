// Batch circuit for aggregating exactly 16 proofs

/// Public outputs of batch aggregation
struct BatchPublic {
    initial_root: Field, // Starting merkle root
    final_root: Field, // Ending merkle root
    batch_nullifiers: [Field; 16], // All nullifiers in batch
}

/// Private inputs - the 16 proofs to aggregate
struct BatchPrivate {
    // proof_data[i] = [nullifier, old_root, new_root, proof_valid_flag]
    proof_data: [[Field; 4]; 16],
}

/// Main batch aggregation circuit
/// Aggregates 16 transaction proofs into a single proof
fn main(public: BatchPublic, private: BatchPrivate) {
    // Verify chain continuity: root_0 -> root_1 -> ... -> root_16
    assert(private.proof_data[0][1] == public.initial_root);
    for i in 1..16 {
        assert(private.proof_data[i][1] == private.proof_data[i - 1][2]);
    }
    assert(public.final_root == private.proof_data[15][2]);

    // Require each individual proof to have been verified upstream (flag = 1)
    for i in 0..16 {
        assert(private.proof_data[i][3] == 1);
    }

    // Collect all nullifiers
    for i in 0..16 {
        assert(public.batch_nullifiers[i] == private.proof_data[i][0]);
    }

    // Enforce intra-batch nullifier uniqueness to prevent double-spend
    for i in 0..15 {
        for j in (i + 1)..16 {
            assert(public.batch_nullifiers[i] != public.batch_nullifiers[j]);
        }
    }
}

#[test]
fn test_batch_16() {
    let public = BatchPublic {
        initial_root: 1000,
        final_root: 1016,
        batch_nullifiers: [
            100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115,
        ],
    };

    let private = BatchPrivate {
        proof_data: [
            [100, 1000, 1001, 1],
            [101, 1001, 1002, 1],
            [102, 1002, 1003, 1],
            [103, 1003, 1004, 1],
            [104, 1004, 1005, 1],
            [105, 1005, 1006, 1],
            [106, 1006, 1007, 1],
            [107, 1007, 1008, 1],
            [108, 1008, 1009, 1],
            [109, 1009, 1010, 1],
            [110, 1010, 1011, 1],
            [111, 1011, 1012, 1],
            [112, 1012, 1013, 1],
            [113, 1013, 1014, 1],
            [114, 1014, 1015, 1],
            [115, 1015, 1016, 1],
        ],
    };

    main(public, private);
}
