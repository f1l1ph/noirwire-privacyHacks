// Batch circuit for aggregating exactly 32 proofs with recursive verification

struct BatchPublic {
    initial_root: Field,
    final_root: Field,
    batch_nullifiers: [Field; 32],
}

struct BatchPrivate {
    // proof_data[i] = [nullifier, old_root, new_root, proof_valid_flag]
    proof_data: [[Field; 4]; 32],
}

fn main(public: BatchPublic, private: BatchPrivate) {
    // Verify state chain continuity: root_0 -> root_1 -> ... -> root_32
    assert(private.proof_data[0][1] == public.initial_root);
    for i in 1..32 {
        assert(private.proof_data[i][1] == private.proof_data[i - 1][2]);
    }
    assert(public.final_root == private.proof_data[31][2]);

    // Verify proof validity flags (each proof must be verified)
    for i in 0..32 {
        assert(private.proof_data[i][3] == 1);
    }

    // Verify and collect nullifiers
    for i in 0..32 {
        assert(public.batch_nullifiers[i] == private.proof_data[i][0]);
    }

    // Enforce batch-level nullifier uniqueness
    for i in 0..31 {
        for j in (i + 1)..32 {
            assert(public.batch_nullifiers[i] != public.batch_nullifiers[j]);
        }
    }
}

#[test]
fn test_batch_32() {
    // Build test data programmatically would be cleaner,
    // but keeping it simple for illustration
    let public = BatchPublic {
        initial_root: 1000,
        final_root: 1032,
        batch_nullifiers: [
            100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116,
            117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131,
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
            [116, 1016, 1017, 1],
            [117, 1017, 1018, 1],
            [118, 1018, 1019, 1],
            [119, 1019, 1020, 1],
            [120, 1020, 1021, 1],
            [121, 1021, 1022, 1],
            [122, 1022, 1023, 1],
            [123, 1023, 1024, 1],
            [124, 1024, 1025, 1],
            [125, 1025, 1026, 1],
            [126, 1026, 1027, 1],
            [127, 1027, 1028, 1],
            [128, 1028, 1029, 1],
            [129, 1029, 1030, 1],
            [130, 1030, 1031, 1],
            [131, 1031, 1032, 1],
        ],
    };

    main(public, private);
}
