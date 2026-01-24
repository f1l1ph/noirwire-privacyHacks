# Noir Implementation Reference

Technical reference for implementing ZK circuits in Noir. Focus on patterns, design choices, and practical examples.

## Project Structure

```
circuits/
├── Nargo.toml              # Package configuration
├── lib.nr                  # Main exports
├── main.nr                 # Re-exports for testing
├── primitives/
│   ├── mod.nr              # Module re-exports
│   ├── types.nr            # Shared type definitions
│   ├── commitment.nr       # Balance commitment hashing
│   ├── nullifier.nr        # Nullifier computation
│   ├── merkle.nr           # Merkle tree operations
│   └── poseidon2.nr        # Hash function (Poseidon2)
├── core/
│   ├── deposit.nr          # Shield circuit
│   ├── transfer.nr         # Private transfer circuit
│   └── withdraw.nr         # Unshield circuit
├── vault/
│   ├── membership.nr       # Vault membership proof
│   └── transfer.nr         # Intra-vault transfer
├── batch/
│   ├── batch_2.nr          # Batch proof aggregation (2 proofs)
│   ├── batch_4.nr
│   ├── batch_8.nr
│   ├── batch_16.nr
│   ├── batch_32.nr
│   └── batch_64.nr
└── tests/
    ├── commitment_tests.nr
    ├── merkle_tests.nr
    ├── deposit_tests.nr
    ├── transfer_tests.nr
    ├── withdraw_tests.nr
    └── vault_tests.nr
```

## Core Types

```noir
// primitives/types.nr

global TREE_DEPTH: u32 = 24;
global COMMITMENT_DOMAIN: Field = 0x01;
global NULLIFIER_DOMAIN: Field = 0x02;

pub struct Balance {
    pub owner: Field,      // Hash(public_key)
    pub amount: Field,     // Token quantity
    pub salt: Field,       // Random blinding factor
    pub vault_id: Field,   // 0 for solo, vault_id for member
}

pub struct MerkleProof<let N: u32> {
    pub siblings: [Field; N],
    pub path_indices: [u1; N],
}
```

## Primitives Module

### Commitment

Hashes balance information into a binding commitment. Used in all transaction circuits.

```noir
// primitives/commitment.nr
use crate::primitives::types::{Balance, COMMITMENT_DOMAIN};
use crate::primitives::poseidon2::Poseidon2;

pub fn compute_commitment(balance: Balance) -> Field {
    Poseidon2::hash([
        COMMITMENT_DOMAIN,
        balance.owner,
        balance.amount,
        balance.salt,
        balance.vault_id
    ], 5)
}

pub fn compute_commitment_explicit(
    owner: Field,
    amount: Field,
    salt: Field,
    vault_id: Field
) -> Field {
    Poseidon2::hash([COMMITMENT_DOMAIN, owner, amount, salt, vault_id], 5)
}

pub fn derive_owner(secret_key: Field) -> Field {
    // Owner is derived deterministically from secret
    Poseidon2::hash([secret_key], 1)
}
```

**Properties:**

- Deterministic: Same inputs → same commitment
- Binding: Cannot change parameters without changing commitment
- Hiding: Commitment reveals nothing about individual components

### Nullifier

Prevents double-spending by computing a unique value per spendable commitment.

```noir
// primitives/nullifier.nr
use crate::primitives::types::NULLIFIER_DOMAIN;
use crate::primitives::poseidon2::Poseidon2;

pub fn compute_nullifier(
    commitment: Field,
    secret_key: Field,
    nonce: Field
) -> Field {
    Poseidon2::hash([NULLIFIER_DOMAIN, commitment, secret_key, nonce], 4)
}
```

**Key Properties:**

- Only secret key holder can compute valid nullifier
- Same commitment with different nonce produces different nullifier
- Nullifier is deterministic and publicly computable given secret
- When revealed on-chain, commitment becomes unspendable

### Merkle Tree

Sparse Merkle tree with efficient inclusion/update proofs.

```noir
// primitives/merkle.nr
use crate::primitives::types::MerkleProof;
use crate::primitives::poseidon2::Poseidon2;

fn hash_pair(left: Field, right: Field) -> Field {
    Poseidon2::hash([left, right], 2)
}

pub fn verify_inclusion<let N: u32>(
    leaf: Field,
    root: Field,
    proof: MerkleProof<N>
) -> bool {
    let mut current = leaf;

    for i in 0..N {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];

        // Constrain to 0 or 1
        assert((is_right == 0) | (is_right == 1));

        // Arithmetic selection (more efficient than if/else)
        let left_hash = hash_pair(current, sibling);
        let right_hash = hash_pair(sibling, current);
        current = left_hash + is_right * (right_hash - left_hash);
    }

    current == root
}

pub fn verify_update<let N: u32>(
    old_leaf: Field,
    new_leaf: Field,
    old_root: Field,
    new_root: Field,
    proof: MerkleProof<N>
) -> bool {
    // Verify old leaf is in tree
    let old_valid = verify_inclusion(old_leaf, old_root, proof);

    // Recompute path with new leaf
    let mut current = new_leaf;
    for i in 0..N {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];

        let left_hash = hash_pair(current, sibling);
        let right_hash = hash_pair(sibling, current);
        current = left_hash + is_right * (right_hash - left_hash);
    }

    old_valid & (current == new_root)
}
```

**Algorithm:**

1. Start with leaf hash
2. For each level, combine with sibling based on position
3. Verify final hash matches root

**Complexity:**

- Verification: O(N) field operations for N-level tree
- Space: O(N) field values for proof
- For 24-level tree: 24 hashes, 24 comparisons

## Core Circuits

### Deposit Circuit

Proves creation of a valid private balance from public token deposit.

```noir
// core/deposit.nr
use crate::primitives::commitment::compute_commitment_explicit;
use crate::primitives::merkle::{MerkleProof, verify_update};
use crate::primitives::types::TREE_DEPTH;

fn main(
    // Public inputs (visible on-chain)
    deposit_amount: pub Field,
    new_commitment: pub Field,
    old_root: pub Field,
    new_root: pub Field,

    // Private inputs (revealed in zero-knowledge)
    owner_pubkey: Field,
    salt: Field,
    vault_id: Field,
    merkle_proof: MerkleProof<TREE_DEPTH>
) {
    // Verify commitment matches deposit
    let computed = compute_commitment_explicit(owner_pubkey, deposit_amount, salt, vault_id);
    assert(computed == new_commitment);

    // Verify tree update: empty slot → new commitment
    let empty_leaf: Field = 0;
    assert(verify_update(empty_leaf, new_commitment, old_root, new_root, merkle_proof));
}
```

**Flow:**

1. User deposits public token amount
2. Circuit proves commitment hash is correct
3. Circuit proves tree can be updated with commitment
4. On-chain: tree root updated, commitment inserted

**Constraints:** ~5K (single Merkle path verification)

### Transfer Circuit

Proves private-to-private transfer with balance conservation.

```noir
// core/transfer.nr
use crate::primitives::commitment::compute_commitment_explicit;
use crate::primitives::commitment::derive_owner;
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::merkle::{MerkleProof, verify_inclusion, verify_update};
use crate::primitives::types::TREE_DEPTH;

fn main(
    // Public inputs
    nullifier: pub Field,
    old_root: pub Field,
    new_root: pub Field,

    // Private - Sender
    sender_secret: Field,
    sender_amount: Field,
    sender_salt: Field,
    sender_vault_id: Field,
    sender_proof: MerkleProof<TREE_DEPTH>,

    // Private - Transfer
    transfer_amount: Field,
    nonce: Field,

    // Private - Receiver
    receiver_pubkey: Field,
    receiver_salt: Field,
    receiver_vault_id: Field,

    // Private - Tree updates
    new_sender_salt: Field,
    new_sender_proof: MerkleProof<TREE_DEPTH>,
    receiver_proof: MerkleProof<TREE_DEPTH>,
    intermediate_root: Field
) {
    let sender_pubkey = derive_owner(sender_secret);

    // 1. Verify sender commitment exists in current tree
    let sender_commitment = compute_commitment_explicit(
        sender_pubkey, sender_amount, sender_salt, sender_vault_id
    );
    assert(verify_inclusion(sender_commitment, old_root, sender_proof));

    // 2. Verify nullifier
    let computed_nullifier = compute_nullifier(sender_commitment, sender_secret, nonce);
    assert(computed_nullifier == nullifier);

    // 3. Verify sufficient balance
    assert((sender_amount as u64) >= (transfer_amount as u64));

    // 4. Compute new state
    let new_sender_amount = sender_amount - transfer_amount;
    let new_sender_commitment = compute_commitment_explicit(
        sender_pubkey, new_sender_amount, new_sender_salt, sender_vault_id
    );
    let receiver_commitment = compute_commitment_explicit(
        receiver_pubkey, transfer_amount, receiver_salt, receiver_vault_id
    );

    // 5. Verify state transitions
    // Sender: old_commitment → new_commitment (reduced amount)
    assert(verify_update(sender_commitment, new_sender_commitment, old_root, intermediate_root, new_sender_proof));

    // Receiver: empty → new_commitment (inserted)
    assert(verify_update(0, receiver_commitment, intermediate_root, new_root, receiver_proof));
}
```

**State Transitions:**

```
Before:  [sender_commitment @ idx_s] [empty @ idx_r]
Transfer: Transfer amount from sender to receiver
After:   [new_sender @ idx_s] [receiver_commitment @ idx_r]
```

**Proves:**

- Sender balance exists in tree
- Nullifier is correct (prevents double-spend)
- Sufficient balance for transfer
- New commitments correctly computed
- Merkle tree validly updated

**Constraints:** ~15K (two Merkle paths + nullifier + balance checks)

### Withdraw Circuit

Proves valid withdrawal from private balance to public address.

```noir
// core/withdraw.nr
use crate::primitives::commitment::compute_commitment_explicit;
use crate::primitives::commitment::derive_owner;
use crate::primitives::nullifier::compute_nullifier;
use crate::primitives::merkle::{MerkleProof, verify_inclusion, verify_update};
use crate::primitives::types::TREE_DEPTH;

fn main(
    // Public inputs
    nullifier: pub Field,
    withdraw_amount: pub Field,
    recipient_address: pub Field,
    old_root: pub Field,
    new_root: pub Field,

    // Private inputs
    owner_secret: Field,
    balance_amount: Field,
    salt: Field,
    vault_id: Field,
    merkle_proof: MerkleProof<TREE_DEPTH>,
    nonce: Field
) {
    let owner_pubkey = derive_owner(owner_secret);

    // 1. Verify commitment exists
    let commitment = compute_commitment_explicit(
        owner_pubkey, balance_amount, salt, vault_id
    );
    assert(verify_inclusion(commitment, old_root, merkle_proof));

    // 2. Verify nullifier
    let computed_nullifier = compute_nullifier(commitment, owner_secret, nonce);
    assert(computed_nullifier == nullifier);

    // 3. Verify sufficient balance
    assert((balance_amount as u64) >= (withdraw_amount as u64));

    // 4. Verify tree update (commitment removed)
    assert(verify_update(commitment, 0, old_root, new_root, merkle_proof));
}
```

**Proves:**

- Balance exists in current tree
- Correct nullifier (prevents double-withdrawal)
- Sufficient balance for withdrawal
- Commitment removed from tree (invalidates further transfers)

**Constraints:** ~10K (one Merkle path + nullifier + balance check)

## Batch Aggregation

Multi-size batch circuits enable efficient proof aggregation for settlement.

```noir
// batch/batch_2.nr - Aggregate two proofs into one

fn main(
    // Public inputs
    initial_root: pub Field,
    final_root: pub Field,
    batch_nullifiers: pub [Field; 2],

    // Private - Proof 1
    proof_1: [Field; 93],
    vk_1: [Field; 114],
    public_inputs_1: [Field; 3],

    // Private - Proof 2
    proof_2: [Field; 93],
    vk_2: [Field; 114],
    public_inputs_2: [Field; 3],

    // Verification parameters
    expected_vk_hash: Field
) {
    // Verify both proofs are valid
    verify_proof(vk_1.as_slice(), proof_1.as_slice(), public_inputs_1.as_slice(), expected_vk_hash);
    verify_proof(vk_2.as_slice(), proof_2.as_slice(), public_inputs_2.as_slice(), expected_vk_hash);

    // Extract state from proofs
    let nullifier_1 = public_inputs_1[0];
    let old_root_1 = public_inputs_1[1];
    let new_root_1 = public_inputs_1[2];

    let nullifier_2 = public_inputs_2[0];
    let old_root_2 = public_inputs_2[1];
    let new_root_2 = public_inputs_2[2];

    // Verify chain: proof1 old_root → new_root → proof2 old_root → new_root
    assert(old_root_1 == initial_root);
    assert(old_root_2 == new_root_1);
    assert(new_root_2 == final_root);

    // Collect nullifiers for on-chain verification
    assert(batch_nullifiers[0] == nullifier_1);
    assert(batch_nullifiers[1] == nullifier_2);
}
```

**Recursion Pattern:**

For larger batches, compose batch circuits:

```
batch_4 = batch_2(batch_2_1, batch_2_2)
batch_8 = batch_4(batch_4_1, batch_4_2)
batch_16 = batch_8(batch_8_1, batch_8_2)
...
```

This allows decomposing any transaction count into minimal proofs.

## Testing Patterns

### Unit Tests

Test individual primitives in isolation:

```noir
#[test]
fn test_commitment_deterministic() {
    let owner = 12345;
    let amount = 1000;
    let salt = 54321;
    let vault = 0;

    let c1 = compute_commitment_explicit(owner, amount, salt, vault);
    let c2 = compute_commitment_explicit(owner, amount, salt, vault);

    assert(c1 == c2);  // Same inputs produce same commitment
}

#[test]
fn test_commitment_changes_with_amount() {
    let owner = 12345;
    let salt = 54321;
    let vault = 0;

    let c1 = compute_commitment_explicit(owner, 1000, salt, vault);
    let c2 = compute_commitment_explicit(owner, 2000, salt, vault);

    assert(c1 != c2);  // Different amount changes commitment
}

#[test]
fn test_nullifier_unique_per_nonce() {
    let commitment = 999;
    let secret = 111;

    let n1 = compute_nullifier(commitment, secret, 1);
    let n2 = compute_nullifier(commitment, secret, 2);

    assert(n1 != n2);  // Different nonce produces different nullifier
}

#[test]
fn test_merkle_inclusion() {
    let leaf = 42;
    let sibling_0 = 10;
    let sibling_1 = 20;

    let level_1 = hash_pair(leaf, sibling_0);
    let root = hash_pair(level_1, sibling_1);

    let proof = MerkleProof {
        siblings: [sibling_0, sibling_1],
        path_indices: [0, 0]
    };

    assert(verify_inclusion(leaf, root, proof));
}

#[test]
fn test_merkle_update() {
    let old_leaf = 42;
    let new_leaf = 99;
    let sibling_0 = 10;
    let sibling_1 = 20;

    let old_level_1 = hash_pair(old_leaf, sibling_0);
    let old_root = hash_pair(old_level_1, sibling_1);

    let new_level_1 = hash_pair(new_leaf, sibling_0);
    let new_root = hash_pair(new_level_1, sibling_1);

    let proof = MerkleProof {
        siblings: [sibling_0, sibling_1],
        path_indices: [0, 0]
    };

    assert(verify_update(old_leaf, new_leaf, old_root, new_root, proof));
}
```

### Integration Tests

Test circuit interaction:

```noir
#[test]
fn test_deposit_then_withdraw() {
    // Setup
    let owner_pubkey = 100;
    let amount = 1000;
    let salt = 999;
    let vault = 0;

    // Deposit
    let commitment = compute_commitment_explicit(owner_pubkey, amount, salt, vault);
    let merkle_proof = MerkleProof { /* ... */ };

    assert(verify_update(0, commitment, old_root, new_root, merkle_proof));

    // Withdraw
    let secret = 200;  // Secret corresponding to pubkey
    let nonce = 1;
    let nullifier = compute_nullifier(commitment, secret, nonce);

    assert(verify_inclusion(commitment, new_root, merkle_proof));
    assert(verify_update(commitment, 0, new_root, final_root, merkle_proof));
}
```

## Implementation Guidelines

### 1. Range Checks for Safety

Always validate type conversions to prevent overflow:

```noir
// Ensure amount fits in u64
let amount_u64 = amount as u64;
let amount_back = amount_u64 as Field;
assert(amount == amount_back);
```

### 2. Domain Separation

Use distinct domains for different hash operations:

```noir
global COMMITMENT_DOMAIN: Field = 0x01;
global NULLIFIER_DOMAIN: Field = 0x02;
global MERKLE_DOMAIN: Field = 0x03;
```

This prevents hash collisions between operation types.

### 3. Efficient Conditionals

Prefer arithmetic selection over if/else for constraints:

```noir
// ✅ Preferred (arithmetic)
let left_hash = hash_pair(current, sibling);
let right_hash = hash_pair(sibling, current);
current = left_hash + is_right * (right_hash - left_hash);

// ❌ Avoid (conditional)
current = if is_right == 1 { ... } else { ... };
```

### 4. Constraint Minimization

- Reuse computed values instead of recomputing
- Use global constants for repeated values
- Combine related assertions when possible

## Verification & Testing Workflow

```bash
# Compile all circuits
nargo compile

# Run all tests
nargo test

# Format code
nargo fmt

# Check diagnostics
nargo check
```

## Performance Characteristics

| Circuit  | Constraints | Proving Time | Proof Size |
| -------- | ----------- | ------------ | ---------- |
| Deposit  | ~5K         | ~1s          | 256 bytes  |
| Transfer | ~15K        | ~3s          | 256 bytes  |
| Withdraw | ~10K        | ~2s          | 256 bytes  |
| Batch 2  | ~200K       | ~10s         | 256 bytes  |

All proofs have same size (Groth16). Constraint count affects proving time, not output.

## References

- [Noir Documentation](https://noir-lang.org/docs/)
- [Barretenberg Backend](https://github.com/AztecProtocol/barretenberg)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Merkle Tree Proofs](https://en.wikipedia.org/wiki/Merkle_tree)
