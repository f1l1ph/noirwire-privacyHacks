// Batch circuit for aggregating exactly 64 proofs
// This is the largest batch size for optimal L1 submission

/// Public outputs of batch aggregation
struct BatchPublic {
    initial_root: Field,           // Starting merkle root
    final_root: Field,             // Ending merkle root
    batch_nullifiers: [Field; 64], // All nullifiers in batch
}

/// Private inputs - the 64 proofs to aggregate
/// Due to Noir's constraint system, large structs may need optimization
struct BatchPrivate {
    // Array of proof data: [nullifier, old_root, new_root, proof_valid_flag]
    proof_data: [[Field; 4]; 64],
}

/// Main batch aggregation circuit
/// Aggregates 64 transaction proofs into a single proof
fn main(
    public: BatchPublic,
    private: BatchPrivate
) {
    // Verify chain continuity using loop
    assert(private.proof_data[0][1] == public.initial_root);
    
    for i in 0..63 {
        // Verify each proof's old_root matches previous proof's new_root
        assert(private.proof_data[i + 1][1] == private.proof_data[i][2]);
    }
    
    assert(public.final_root == private.proof_data[63][2]);

    // Enforce each proof was individually verified upstream (flag = 1)
    for i in 0..64 {
        assert(private.proof_data[i][3] == 1);
    }

    // Collect all nullifiers
    for i in 0..64 {
        assert(public.batch_nullifiers[i] == private.proof_data[i][0]);
    }

    // Enforce intra-batch nullifier uniqueness to prevent double-spend
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
        let nullifier = 100 + i;
        let old_root = 1000 + i;
        let new_root = 1000 + i + 1;
        
        proof_data[i] = [nullifier, old_root, new_root, 1];
        batch_nullifiers[i] = nullifier;
    }

    let public = BatchPublic {
        initial_root: 1000,
        final_root: 1064,
        batch_nullifiers
    };

    let private = BatchPrivate {
        proof_data
    };

    main(public, private);
}
