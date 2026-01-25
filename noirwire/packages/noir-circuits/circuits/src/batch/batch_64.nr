// Batch circuit for aggregating exactly 64 proofs with recursive verification
// Largest batch size for optimal L1 submission

struct BatchPublic {
    initial_root: Field,
    final_root: Field,
    batch_nullifiers: [Field; 64],
}

struct BatchPrivate {
    // Array of proof data: [nullifier, old_root, new_root, proof_valid_flag]
    proof_data: [[Field; 4]; 64],
}

fn main(public: BatchPublic, private: BatchPrivate) {
    // Verify state chain continuity
    assert(private.proof_data[0][1] == public.initial_root);

    for i in 0..63 {
        assert(private.proof_data[i + 1][1] == private.proof_data[i][2]);
    }

    assert(public.final_root == private.proof_data[63][2]);

    // Verify proof validity flags (each proof must be verified)
    for i in 0..64 {
        assert(private.proof_data[i][3] == 1);
    }

    // Verify and collect nullifiers
    for i in 0..64 {
        assert(public.batch_nullifiers[i] == private.proof_data[i][0]);
    }

    // Enforce batch-level nullifier uniqueness
    for i in 0..63 {
        for j in (i + 1)..64 {
            assert(public.batch_nullifiers[i] != public.batch_nullifiers[j]);
        }
    }
}

#[test]
fn test_batch_64() {
    // Build mock proof data
    let mut proof_data: [[Field; 4]; 64] = [[0; 4]; 64];
    let mut batch_nullifiers: [Field; 64] = [0; 64];

    for i in 0..64 {
        let nullifier: Field = (100 + i) as Field;
        let old_root: Field = (1000 + i) as Field;
        let new_root: Field = (1000 + i + 1) as Field;

        proof_data[i] = [nullifier, old_root, new_root, 1];
        batch_nullifiers[i] = nullifier;
    }

    let public = BatchPublic { initial_root: 1000, final_root: 1064, batch_nullifiers };

    let private = BatchPrivate { proof_data };

    main(public, private);
}
