# 01 — ZK Noir Circuits: High-Level Architecture

## Overview

This blueprint defines the ZK proof system for the **Shielded Pool + Vaults** architecture. The circuits prove valid state transitions without revealing sensitive information (balances, senders, receivers).

> **Reference:** See [Vault_research.md](Vault_research.md) for the full system architecture.

---

## Table of Contents

1. [PER + Noir ZK: The Hybrid Architecture](#1-per--noir-zk-the-hybrid-architecture)
2. [Design Philosophy](#2-design-philosophy)
3. [Circuit Hierarchy](#3-circuit-hierarchy)
4. [Data Structures](#4-data-structures)
5. [Core Circuits](#5-core-circuits)
6. [Vault-Specific Circuits](#6-vault-specific-circuits)
7. [Optimized Batching Strategy](#7-optimized-batching-strategy)
8. [Libraries & Dependencies](#8-libraries--dependencies)
9. [File Structure](#9-file-structure)

---

## 1. PER + Noir ZK: The Hybrid Architecture

### Why We Need Both

We're building **Railgun-style private payments** — every transfer requires ZK proofs (nullifiers, merkle proofs, balance conservation). MagicBlock's PER TEE is our **proving environment**, not a replacement for ZK.

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE MAGIC: ZK PROVING INSIDE TEE             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   USER SUBMITS TX                                              │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │              PER TEE (Intel TDX)                        │  │
│   │                                                         │  │
│   │  1. Receive private tx request                          │  │
│   │  2. Generate Noir ZK proof for each tx (Railgun-style)  │  │
│   │  3. Accumulate proofs in batch                          │  │
│   │  4. Aggregate using multi-size batch circuits           │  │
│   │  5. Update internal state (merkle tree, nullifiers)     │  │
│   │                                                         │  │
│   │  Benefits:                                              │  │
│   │  • Fast proving (dedicated TEE compute)                 │  │
│   │  • Batch multiple txs before settlement                 │  │
│   │  • Inputs stay encrypted (even operator can't see)      │  │
│   │  • Aggregation reduces L1 proof overhead                │  │
│   │                                                         │  │
│   └─────────────────────────────────────────────────────────┘  │
│                          │                                      │
│                          │ SETTLEMENT                           │
│                          ▼                                      │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    SOLANA L1                            │  │
│   │                                                         │  │
│   │  Submit:                                                │  │
│   │  • Aggregated batch ZK proof                            │  │
│   │  • New merkle root                                      │  │
│   │  • Nullifiers (prevent double-spend)                    │  │
│   │                                                         │  │
│   │  L1 verifies: proof is valid → accept state update      │  │
│   │                                                         │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Combo is Powerful

| Component          | What It Provides                                    |
| ------------------ | --------------------------------------------------- |
| **Noir ZK Proofs** | Cryptographic privacy guarantees (Railgun-style)    |
| **PER TEE**        | Fast proving environment + batching + input privacy |
| **Combined**       | Private payments with efficient L1 settlement       |

### The Flow

```
100 private transfers inside PER:

Step 1: Generate individual proofs (inside TEE)
├── TX 1 → ZK proof (nullifier, merkle proof, balance check)
├── TX 2 → ZK proof
├── ...
└── TX 100 → ZK proof

Step 2: Batch aggregate (inside TEE)
├── batch_64.nr → aggregates 64 proofs
├── batch_32.nr → aggregates 32 proofs
├── batch_4.nr  → aggregates 4 proofs
└── final_aggregator → 1 proof for L1

Step 3: Settlement
├── Submit single aggregated proof
├── Submit new merkle root
├── Submit 100 nullifiers
└── L1 verifies proof → updates state
```

### What TEE Adds (vs Pure ZK)

| Without TEE                           | With PER TEE                         |
| ------------------------------------- | ------------------------------------ |
| User generates proofs locally         | TEE generates proofs (faster)        |
| Single tx proofs to L1                | Batch many txs before settlement     |
| Proving inputs exposed to user device | Inputs encrypted even during proving |
| L1 gas per transaction                | Amortized L1 gas across batch        |

### What ZK Adds (vs Pure TEE)

| Without ZK                         | With Noir ZK                         |
| ---------------------------------- | ------------------------------------ |
| Trust Intel TDX only               | Cryptographic guarantees             |
| TEE compromise = system compromise | Proofs valid regardless of TEE state |
| No on-chain verification           | L1 can verify correctness            |
| Weaker privacy model               | Railgun-style unlinkability          |

### Trust Model

```
┌────────────────────────────────────────────────────────────┐
│                    LAYERED SECURITY                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Layer 1: Hardware (PER TEE)                              │
│  └── Intel TDX attestation                                │
│  └── Encrypted memory / isolated execution                │
│                                                            │
│  Layer 2: Cryptography (Noir ZK)                          │
│  └── Nullifiers prevent double-spend                      │
│  └── Merkle proofs verify balance existence               │
│  └── Balance conservation (no money creation)             │
│                                                            │
│  Layer 3: Blockchain (Solana L1)                          │
│  └── Proof verification (alt_bn128 pairing)               │
│  └── Nullifier set (prevents replay)                      │
│  └── State commitment (merkle root)                       │
│                                                            │
│  Attack requires: TEE break + ZK break + Solana break     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Practical Architecture

```
noirwire-per/
├── circuits/           # Noir ZK circuits (compiled to ACIR)
│   ├── transfer.nr     # Railgun-style transfer proof
│   ├── batch_N.nr      # Aggregation circuits
│   └── ...
│
├── prover/             # Runs INSIDE TEE
│   ├── proof_generator.rs    # Calls Noir prover
│   ├── batch_aggregator.rs   # Combines proofs
│   └── state_manager.rs      # Merkle tree, nullifiers
│
├── per-program/        # MagicBlock PER integration
│   ├── lib.rs          # Ephemeral rollup logic
│   └── permission.rs   # Access control
│
└── solana-verifier/    # L1 verification
    ├── lib.rs          # Anchor program
    └── groth16.rs      # Proof verification
```

---

## 2. Design Philosophy

### What We Prove

| Proof                      | What It Guarantees                            |
| -------------------------- | --------------------------------------------- |
| **Balance Conservation**   | No tokens created/destroyed in transfers      |
| **Ownership**              | Only owner can spend from their balance       |
| **No Double-Spend**        | Each note can only be spent once (nullifiers) |
| **Merkle Membership**      | Balance exists in the commitment tree         |
| **Valid State Transition** | Old root → New root is correct                |

### What Stays Private

| Data                | Visibility                 |
| ------------------- | -------------------------- |
| Individual balances | 🔒 Private                 |
| Sender identity     | 🔒 Private                 |
| Receiver identity   | 🔒 Private                 |
| Transfer amounts    | 🔒 Private                 |
| Total pool balance  | 🌐 Public (on L1)          |
| Merkle roots        | 🌐 Public                  |
| Nullifiers          | 🌐 Public (but unlinkable) |

### Circuit Design Principles

1. **Modular** — Each circuit does one thing well
2. **Composable** — Circuits can be combined via recursion
3. **Efficient** — Minimize constraints, use native Noir operations
4. **Auditable** — Clear structure, documented invariants

---

## 2. Circuit Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    CIRCUIT ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LAYER 3: Aggregation (Recursive)                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   batch_proof.nr                        │   │
│  │         Aggregates N transaction proofs                 │   │
│  │         into a single proof for L1                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ▲                                      │
│                          │ verify_proof()                       │
│                                                                 │
│  LAYER 2: Transaction Circuits                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │  deposit.nr  │ │ transfer.nr  │ │ withdraw.nr  │           │
│  │   (shield)   │ │  (private)   │ │  (unshield)  │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│         │                │                │                    │
│         └────────────────┼────────────────┘                    │
│                          │                                      │
│  LAYER 1: Primitives                                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │  merkle.nr   │ │ nullifier.nr │ │commitment.nr │           │
│  │  (trees)     │ │ (double-     │ │  (balance    │           │
│  │              │ │  spend)      │ │   hashing)   │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                 │
│  VAULT EXTENSION                                               │
│  ┌──────────────┐ ┌──────────────┐                            │
│  │ vault_       │ │ vault_       │                            │
│  │ membership.nr│ │ transfer.nr  │                            │
│  └──────────────┘ └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Structures

### 3.1 Balance Commitment

A balance is stored as a commitment (hash) in the Merkle tree:

```noir
// Commitment = hash(owner, amount, salt, vault_id?)
struct Balance {
    owner: Field,           // Poseidon hash of public key
    amount: Field,          // Token amount (as Field)
    salt: Field,            // Random blinding factor
    vault_id: Field,        // 0 for solo users, vault hash for members
}

// The commitment stored in the tree
fn compute_commitment(balance: Balance) -> Field {
    let inputs = [
        balance.owner,
        balance.amount,
        balance.salt,
        balance.vault_id
    ];
    poseidon2::hash(inputs, 4)
}
```

### 3.2 Nullifier

Prevents double-spending by revealing a unique hash when spending:

```noir
// Nullifier = hash(commitment, secret_key, nonce)
fn compute_nullifier(
    commitment: Field,
    secret_key: Field,
    nonce: Field
) -> Field {
    poseidon2::hash([commitment, secret_key, nonce], 3)
}
```

**Why it works:**

- Nullifier is deterministic but unlinkable to the commitment
- Same commitment + key = same nullifier (prevents double-spend)
- Can't derive commitment from nullifier (hiding)

### 3.3 Merkle Tree

Using **Sparse Merkle Tree** for the balance tree (allows non-membership proofs):

```noir
// Tree depth: 32 levels = 2^32 possible leaves
global TREE_DEPTH: u32 = 32;

struct MerkleProof {
    siblings: [Field; TREE_DEPTH],  // Sibling hashes
    path_indices: [u1; TREE_DEPTH], // Left (0) or Right (1)
}

fn verify_merkle_inclusion(
    leaf: Field,
    root: Field,
    proof: MerkleProof
) -> bool {
    let mut current = leaf;

    for i in 0..TREE_DEPTH {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];

        current = if is_right == 1 {
            poseidon2::hash([sibling, current], 2)
        } else {
            poseidon2::hash([current, sibling], 2)
        };
    }

    current == root
}
```

### 3.4 Transfer Note

Encrypted data sent to receiver:

```noir
struct TransferNote {
    amount: Field,
    salt: Field,           // For receiver to reconstruct commitment
    sender_vault: Field,   // 0 if from solo user
}
```

---

## 4. Core Circuits

### 4.1 Deposit Circuit (Shield)

**Purpose:** Prove that a public deposit creates a valid private balance.

```
PUBLIC INPUTS:
├── deposit_amount      (visible on L1)
├── new_commitment      (added to tree)
└── new_root            (after insertion)

PRIVATE INPUTS:
├── owner_pubkey
├── salt
├── vault_id
├── merkle_insertion_proof
└── old_root
```

```noir
// circuits/deposit.nr

use dep::std::hash::poseidon2::Poseidon2::hash as poseidon2;

fn main(
    // Public inputs
    deposit_amount: pub Field,
    new_commitment: pub Field,
    new_root: pub Field,

    // Private inputs
    owner: Field,
    salt: Field,
    vault_id: Field,
    insertion_proof: MerkleProof,
    old_root: Field
) {
    // 1. Verify commitment is correctly computed
    let computed_commitment = poseidon2(
        [owner, deposit_amount, salt, vault_id],
        4
    );
    assert(computed_commitment == new_commitment);

    // 2. Verify the insertion proof (new leaf in tree)
    // Using SMT: proves slot was empty, now has commitment
    let empty_leaf = Field::default();
    assert(verify_smt_update(
        old_root,
        new_root,
        new_commitment,    // key = commitment
        empty_leaf,        // old value
        computed_commitment, // new value
        insertion_proof
    ));
}
```

### 4.2 Transfer Circuit (Private)

**Purpose:** Prove a valid private transfer between two parties.

```
PUBLIC INPUTS:
├── nullifier           (prevents double-spend)
├── old_root            (current tree state)
├── new_root            (after transfer)
└── encrypted_note      (for receiver)

PRIVATE INPUTS:
├── sender_balance      (full Balance struct)
├── sender_secret_key
├── sender_proof        (merkle proof)
├── transfer_amount
├── receiver_pubkey
├── receiver_salt
├── receiver_vault_id
├── new_sender_balance  (remainder)
├── new_sender_salt
└── update_proofs
```

```noir
// circuits/transfer.nr

fn main(
    // Public
    nullifier: pub Field,
    old_root: pub Field,
    new_root: pub Field,

    // Private - Sender
    sender_commitment: Field,
    sender_amount: Field,
    sender_salt: Field,
    sender_vault_id: Field,
    sender_secret: Field,
    sender_proof: MerkleProof,

    // Private - Transfer
    transfer_amount: Field,
    nonce: Field,

    // Private - Receiver
    receiver_owner: Field,
    receiver_salt: Field,
    receiver_vault_id: Field,

    // Private - New sender balance
    new_sender_salt: Field
) {
    // ===== SENDER CHECKS =====

    // 1. Reconstruct sender's commitment
    let sender_owner = poseidon2([sender_secret], 1);
    let computed_sender_commitment = poseidon2(
        [sender_owner, sender_amount, sender_salt, sender_vault_id],
        4
    );
    assert(computed_sender_commitment == sender_commitment);

    // 2. Verify sender's balance exists in tree
    assert(verify_merkle_inclusion(
        sender_commitment,
        old_root,
        sender_proof
    ));

    // 3. Verify nullifier is correct
    let computed_nullifier = poseidon2(
        [sender_commitment, sender_secret, nonce],
        3
    );
    assert(computed_nullifier == nullifier);

    // 4. Verify sufficient balance
    assert(sender_amount as u64 >= transfer_amount as u64);

    // ===== BALANCE CONSERVATION =====

    // 5. Compute new balances
    let new_sender_amount = sender_amount - transfer_amount;
    let receiver_amount = transfer_amount;

    // 6. Compute new commitments
    let new_sender_commitment = poseidon2(
        [sender_owner, new_sender_amount, new_sender_salt, sender_vault_id],
        4
    );

    let receiver_commitment = poseidon2(
        [receiver_owner, receiver_amount, receiver_salt, receiver_vault_id],
        4
    );

    // 7. Verify tree update (old sender → new sender + receiver)
    // This is the complex part - need to prove:
    //   - Old sender commitment removed (nullified)
    //   - New sender commitment added (if non-zero)
    //   - Receiver commitment added
    //   - Root transition is valid

    // [Implementation depends on tree update strategy]
    // Could use batch update proof or sequential proofs
}
```

### 4.3 Withdraw Circuit (Unshield)

**Purpose:** Prove a valid withdrawal from private to public.

```noir
// circuits/withdraw.nr

fn main(
    // Public
    nullifier: pub Field,
    withdraw_amount: pub Field,
    recipient_address: pub Field,  // Solana pubkey
    old_root: pub Field,
    new_root: pub Field,

    // Private
    owner_secret: Field,
    balance_amount: Field,
    balance_salt: Field,
    balance_vault_id: Field,
    merkle_proof: MerkleProof,
    nonce: Field,
    new_balance_salt: Field
) {
    // 1. Reconstruct commitment
    let owner = poseidon2([owner_secret], 1);
    let commitment = poseidon2(
        [owner, balance_amount, balance_salt, balance_vault_id],
        4
    );

    // 2. Verify exists in tree
    assert(verify_merkle_inclusion(commitment, old_root, merkle_proof));

    // 3. Verify nullifier
    let computed_nullifier = poseidon2(
        [commitment, owner_secret, nonce],
        3
    );
    assert(computed_nullifier == nullifier);

    // 4. Verify sufficient balance
    assert(balance_amount as u64 >= withdraw_amount as u64);

    // 5. Compute remainder
    let remainder = balance_amount - withdraw_amount;

    // 6. If remainder > 0, create new commitment
    if remainder as u64 > 0 {
        let new_commitment = poseidon2(
            [owner, remainder, new_balance_salt, balance_vault_id],
            4
        );
        // Verify new commitment added to tree
        // [merkle update proof]
    }

    // 7. Verify root transition
    // [state transition proof]
}
```

---

## 5. Vault-Specific Circuits

### 5.1 Vault Membership Proof

**Purpose:** Prove caller is a member of a vault without revealing which member.

```noir
// circuits/vault_membership.nr

struct VaultMembership {
    vault_id: Field,
    members_root: Field,  // Merkle root of member list
}

fn main(
    // Public
    vault_id: pub Field,
    members_root: pub Field,

    // Private
    member_pubkey: Field,
    member_secret: Field,
    membership_proof: MerkleProof
) {
    // 1. Derive member's identifier from secret
    let member_id = poseidon2([member_secret], 1);
    assert(member_id == member_pubkey);

    // 2. Prove membership in vault's member list
    let member_leaf = poseidon2([vault_id, member_pubkey], 2);

    assert(verify_merkle_inclusion(
        member_leaf,
        members_root,
        membership_proof
    ));
}
```

### 5.2 Vault Transfer (Internal)

**Purpose:** Transfer within a vault with membership verification.

```noir
// circuits/vault_transfer.nr

fn main(
    // Public
    nullifier: pub Field,
    vault_id: pub Field,
    old_root: pub Field,
    new_root: pub Field,

    // Private - Sender
    sender_secret: Field,
    sender_vault_membership_proof: MerkleProof,
    sender_balance: Balance,
    sender_balance_proof: MerkleProof,

    // Private - Transfer
    amount: Field,

    // Private - Receiver (must also be vault member)
    receiver_pubkey: Field,
    receiver_vault_membership_proof: MerkleProof,

    // ... additional params
) {
    // 1. Verify sender is vault member
    verify_vault_membership(
        vault_id,
        poseidon2([sender_secret], 1),
        sender_vault_membership_proof
    );

    // 2. Verify receiver is vault member
    verify_vault_membership(
        vault_id,
        receiver_pubkey,
        receiver_vault_membership_proof
    );

    // 3. Verify sender's balance is in this vault
    assert(sender_balance.vault_id == vault_id);

    // 4. Standard transfer logic...
    // [Same as regular transfer but with vault checks]
}
```

---

## 6. Optimized Batching Strategy

### The Problem

Noir circuits have **fixed sizes** at compile time:

```noir
// ❌ This won't work
fn main(transactions: [Transaction; N]) // N must be known at compile
```

**Naive Solution (Binary Aggregation):** For N transactions, generate N-1 aggregation proofs:

- 100 txs → 99 proofs (terrible!)

### The Solution: Pre-Compiled Multi-Size Batch Circuits

Instead of only aggregating 2 proofs at a time, we **pre-compile circuits for multiple batch sizes**:

```
┌─────────────────────────────────────────────────────────────────┐
│                PRE-COMPILED BATCH CIRCUITS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Compile Time: Generate these circuits once                   │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│   │ batch_2  │ │ batch_4  │ │ batch_8  │ │ batch_16 │ ...    │
│   │ verifies │ │ verifies │ │ verifies │ │ verifies │        │
│   │ 2 proofs │ │ 4 proofs │ │ 8 proofs │ │ 16 proofs│        │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                                 │
│   Also: batch_32, batch_64 for high throughput                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Optimal Batch Decomposition

For **100 transactions**, decompose into powers of 2:

```
100 = 64 + 32 + 4

Step 1: batch_64.nr → 1 proof (aggregates 64 tx proofs)
Step 2: batch_32.nr → 1 proof (aggregates 32 tx proofs)
Step 3: batch_4.nr  → 1 proof (aggregates 4 tx proofs)
Step 4: batch_4.nr  → 1 proof (aggregates the 3 batch proofs + 1 padding)

Total: ~4 aggregation proofs instead of 99!
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPTIMIZED BATCHING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   100 Transaction Proofs                                       │
│   ┌────────────────────────────────────────────────┬──────┐   │
│   │               64 proofs                        │ 32   │ 4 │
│   └────────────────────┬───────────────────────────┴──┬───┴─┬─┘
│                        ▼                               ▼     ▼  │
│                  ┌──────────┐                   ┌────────┐┌───┐│
│                  │ batch_64 │                   │batch_32││b_4││
│                  │  proof   │                   │ proof  ││prf││
│                  └────┬─────┘                   └───┬────┘└─┬─┘│
│                       │                             │       │   │
│                       └──────────────┬──────────────┘       │   │
│                                      ▼                      │   │
│                                 ┌─────────┐                 │   │
│                                 │ batch_4 │◄────────────────┘   │
│                                 │ (final) │                     │
│                                 └────┬────┘                     │
│                                      │                          │
│                                      ▼                          │
│                                Submit to L1                     │
│                                 (~4 proofs)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pre-Compiled Batch Circuits

```noir
// circuits/batch/batch_4.nr
// Aggregates exactly 4 proofs

use dep::std::verify_proof;

fn main(
    // Public outputs
    final_root: pub Field,
    batch_nullifiers: pub [Field; 4],

    // 4 proofs to aggregate
    proofs: [[Field; PROOF_SIZE]; 4],
    verification_keys: [[Field; VK_SIZE]; 4],
    public_inputs: [[Field; 3]; 4],  // [nullifier, old_root, new_root]

    // Chaining
    initial_root: Field
) {
    // Verify all 4 proofs
    for i in 0..4 {
        verify_proof(
            verification_keys[i],
            proofs[i],
            public_inputs[i],
            Field::default()
        );
    }

    // Verify chain continuity: root_0 → root_1 → root_2 → root_3
    assert(public_inputs[0][1] == initial_root);  // First old_root
    for i in 1..4 {
        assert(public_inputs[i][1] == public_inputs[i-1][2]);  // old_root[i] == new_root[i-1]
    }
    assert(final_root == public_inputs[3][2]);  // Final new_root

    // Collect nullifiers
    for i in 0..4 {
        assert(batch_nullifiers[i] == public_inputs[i][0]);
    }
}
```

```noir
// circuits/batch/batch_8.nr
// Same pattern but for 8 proofs

fn main(
    final_root: pub Field,
    batch_nullifiers: pub [Field; 8],
    proofs: [[Field; PROOF_SIZE]; 8],
    verification_keys: [[Field; VK_SIZE]; 8],
    public_inputs: [[Field; 3]; 8],
    initial_root: Field
) {
    // Verify all 8 proofs
    for i in 0..8 {
        verify_proof(verification_keys[i], proofs[i], public_inputs[i], Field::default());
    }

    // Verify chain continuity
    assert(public_inputs[0][1] == initial_root);
    for i in 1..8 {
        assert(public_inputs[i][1] == public_inputs[i-1][2]);
    }
    assert(final_root == public_inputs[7][2]);

    // Collect nullifiers
    for i in 0..8 {
        assert(batch_nullifiers[i] == public_inputs[i][0]);
    }
}

// Similar circuits: batch_16.nr, batch_32.nr, batch_64.nr
```

### Batch Decomposition Algorithm

```rust
// Rust pseudocode for optimal decomposition

fn decompose_batch(n: usize) -> Vec<usize> {
    let available_sizes = [64, 32, 16, 8, 4, 2];
    let mut remaining = n;
    let mut batches = Vec::new();

    for size in available_sizes {
        while remaining >= size {
            batches.push(size);
            remaining -= size;
        }
    }

    // Handle remainder with padding if needed
    if remaining > 0 {
        // Pad to next power of 2
        let padded_size = remaining.next_power_of_two();
        batches.push(padded_size);
    }

    batches
}

// Example: decompose_batch(100) → [64, 32, 4]
// Example: decompose_batch(50) → [32, 16, 2]
// Example: decompose_batch(7) → [4, 2, 2] or [8] with 1 padding
```

### Scaling Comparison

| Transactions | Binary (N-1) | Multi-Size | Improvement |
| ------------ | ------------ | ---------- | ----------- |
| 8            | 7 proofs     | 1 proof    | **7x**      |
| 16           | 15 proofs    | 1 proof    | **15x**     |
| 32           | 31 proofs    | 1 proof    | **31x**     |
| 50           | 49 proofs    | ~3 proofs  | **16x**     |
| 64           | 63 proofs    | 1 proof    | **63x**     |
| 100          | 99 proofs    | ~4 proofs  | **25x**     |
| 1000         | 999 proofs   | ~15 proofs | **66x**     |

### Final Aggregation

After decomposition, aggregate the batch proofs themselves:

```noir
// circuits/batch/final_aggregator.nr
// Aggregates batch proofs (not tx proofs)

fn main(
    final_root: pub Field,
    total_nullifiers_hash: pub Field,  // Hash of all nullifiers

    // Variable number handled by having multiple circuit sizes
    batch_proofs: [[Field; BATCH_PROOF_SIZE]; 4],  // e.g., final_agg_4
    batch_vks: [[Field; VK_SIZE]; 4],
    batch_public_inputs: [[Field]; 4],

    initial_root: Field
) {
    // Verify each batch proof
    for i in 0..4 {
        verify_proof(batch_vks[i], batch_proofs[i], batch_public_inputs[i], Field::default());
    }

    // Verify chain across batches
    assert(batch_public_inputs[0].initial_root == initial_root);
    for i in 1..4 {
        // batch[i].initial_root == batch[i-1].final_root
    }
    assert(final_root == batch_public_inputs[3].final_root);

    // Aggregate all nullifiers into single commitment
    // [hash all nullifiers together]
}
```

### Benefits of Multi-Size Batching

- ✅ **Dramatically fewer proofs** (25-66x improvement)
- ✅ **Parallelizable** - all batch circuits can run simultaneously
- ✅ **Predictable costs** - known circuit sizes at compile time
- ✅ **Flexible** - handles any transaction count efficiently
- ✅ **TEE-friendly** - batch at settlement, not per-transaction

---

## 7. Libraries & Dependencies

### Required Noir Libraries

```toml
# Nargo.toml

[dependencies]
# Poseidon2 hash (native, most efficient)
# Included in std library

# Merkle Trees (ZK-Kit)
merkle_trees = {
    git = "https://github.com/privacy-scaling-explorations/zk-kit.noir",
    tag = "merkle-trees-v0.0.1",
    directory = "packages/merkle-trees"
}

# BigNum (if needed for large values)
bignum = {
    git = "https://github.com/noir-lang/noir-bignum"
}
```

### Hash Function Choice

| Hash          | Constraints | Use Case                   |
| ------------- | ----------- | -------------------------- |
| **Poseidon2** | ~300        | ✅ Default for commitments |
| Pedersen      | ~1000       | Legacy compatibility       |
| SHA256        | ~25000      | NOT recommended            |
| Blake3        | ~5000       | External verification      |

**Recommendation:** Use `Poseidon2` everywhere (native Noir support).

---

## 8. File Structure

```
circuits/
├── lib.nr                    # Main library exports
│
├── primitives/
│   ├── mod.nr
│   ├── commitment.nr         # Balance commitment
│   ├── nullifier.nr          # Nullifier computation
│   └── merkle.nr             # Merkle tree operations
│
├── core/
│   ├── mod.nr
│   ├── deposit.nr            # Shield funds
│   ├── transfer.nr           # Private transfer
│   └── withdraw.nr           # Unshield funds
│
├── vault/
│   ├── mod.nr
│   ├── membership.nr         # Vault membership proof
│   └── transfer.nr           # Intra-vault transfer
│
├── batch/
│   ├── mod.nr
│   ├── batch_2.nr            # Aggregate 2 proofs
│   ├── batch_4.nr            # Aggregate 4 proofs
│   ├── batch_8.nr            # Aggregate 8 proofs
│   ├── batch_16.nr           # Aggregate 16 proofs
│   ├── batch_32.nr           # Aggregate 32 proofs
│   ├── batch_64.nr           # Aggregate 64 proofs
│   └── final_aggregator.nr   # Aggregate batch proofs
│
└── tests/
    ├── mod.nr
    ├── test_deposit.nr
    ├── test_transfer.nr
    └── test_batch.nr
```

---

## Summary

| Circuit            | Purpose                     | Complexity |
| ------------------ | --------------------------- | ---------- |
| `deposit`          | Shield public → private     | Low        |
| `transfer`         | Private → private           | Medium     |
| `withdraw`         | Private → public            | Medium     |
| `vault_membership` | Prove vault membership      | Low        |
| `vault_transfer`   | Transfer within vault       | Medium     |
| `batch_N`          | Aggregate N proofs (2-64)   | Medium     |
| `final_aggregator` | Combine batch proofs for L1 | Medium     |

### Architecture Summary

| Component             | Role                                      |
| --------------------- | ----------------------------------------- |
| **Noir ZK Circuits**  | Railgun-style proofs (nullifiers, merkle) |
| **PER TEE**           | Fast proving environment + batching       |
| **Batch Aggregation** | Combine N proofs → 1 proof for L1         |
| **Solana Verifier**   | On-chain Groth16 verification             |

**Key Insight:** TEE handles proof generation (fast, private), ZK provides cryptographic guarantees. We get Railgun-style privacy with efficient batch settlement.

**Next Blueprint:** [02_Noir_Implementation.md](02_Noir_Implementation.md) — Detailed code, testing, and Solana verifier integration.

---

## References

- [Noir Documentation](https://noir-lang.org/docs/)
- [ZK-Kit Merkle Trees](https://github.com/privacy-scaling-explorations/zk-kit.noir/tree/main/packages/merkle-trees)
- [Noir Recursive Proofs](https://noir-lang.org/docs/noir/standard_library/recursion)
- [Poseidon2 Hash](https://noir-lang.org/docs/noir/standard_library/cryptographic_primitives/hashes#pedersen_hash)
- [Barretenberg Backend](https://github.com/AztecProtocol/barretenberg)

---

_Blueprint Version: 1.0_
_Status: Ready for Implementation_
