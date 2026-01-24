# NoirWire ZK Circuits

This package contains the Noir ZK circuits for NoirWire's private payment system.

## Structure

```
circuits/
├── src/
│   ├── lib.nr                 # Main library exports
│   ├── primitives/            # Basic building blocks
│   │   ├── commitment.nr      # Balance commitment
│   │   ├── nullifier.nr       # Nullifier computation
│   │   └── merkle.nr          # Merkle tree operations
│   ├── core/                  # Transaction circuits
│   │   ├── deposit.nr         # Shield funds
│   │   ├── transfer.nr        # Private transfer
│   │   └── withdraw.nr        # Unshield funds
│   └── batch/                 # Batch aggregation circuits
│       ├── batch_2.nr         # Aggregate 2 proofs
│       ├── batch_4.nr         # Aggregate 4 proofs
│       ├── batch_8.nr         # Aggregate 8 proofs
│       ├── batch_16.nr        # Aggregate 16 proofs
│       ├── batch_32.nr        # Aggregate 32 proofs
│       └── batch_64.nr        # Aggregate 64 proofs
```

## Building

```bash
# Compile all circuits
nargo compile

# Test circuits
nargo test

# Generate verification keys
nargo codegen-verifier
```

## Configuration

- **Tree Depth**: 24 levels (~16M leaves)
- **Hash Function**: Poseidon2 (from stdlib)
- **Backend**: Barretenberg
