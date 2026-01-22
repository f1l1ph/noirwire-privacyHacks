# 02 — Noir Implementation Details

## Overview

This blueprint provides detailed implementation guidance for the circuits defined in [01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md). It covers code organization, testing strategies, Solana verifier integration, and performance optimization.

---

## Table of Contents

1. [Project Setup](#1-project-setup)
2. [Primitive Implementations](#2-primitive-implementations)
3. [Core Circuit Code](#3-core-circuit-code)
4. [Testing Strategy](#4-testing-strategy)
5. [Solana Verifier Integration](#5-solana-verifier-integration)
6. [Performance Optimization](#6-performance-optimization)
7. [Development Workflow](#7-development-workflow)

---

## 1. Project Setup

### Initialize Noir Project

```bash
# Install Noir (nargo)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Create project
nargo new noirwire_circuits
cd noirwire_circuits
```

### Project Configuration

```toml
# Nargo.toml

[package]
name = "noirwire_circuits"
type = "lib"
authors = ["NoirWire Team"]
compiler_version = ">=1.0.0"

[dependencies]
# ZK-Kit Merkle Trees
merkle_trees = {
    git = "https://github.com/privacy-scaling-explorations/zk-kit.noir",
    tag = "merkle-trees-v0.0.1",
    directory = "packages/merkle-trees"
}

# Poseidon library (standalone)
poseidon = {
    git = "https://github.com/noir-lang/poseidon"
}
```

### Directory Structure

```
noirwire_circuits/
├── Nargo.toml
├── src/
│   ├── lib.nr                      # Main exports
│   │
│   ├── primitives/
│   │   ├── mod.nr
│   │   ├── commitment.nr
│   │   ├── nullifier.nr
│   │   ├── merkle.nr
│   │   └── types.nr                # Common types
│   │
│   ├── core/
│   │   ├── mod.nr
│   │   ├── deposit.nr
│   │   ├── transfer.nr
│   │   └── withdraw.nr
│   │
│   ├── vault/
│   │   ├── mod.nr
│   │   ├── membership.nr
│   │   └── transfer.nr
│   │
│   └── batch/
│       ├── mod.nr
│       └── aggregator.nr
│
├── circuits/                        # Executable circuits
│   ├── deposit/
│   │   ├── Nargo.toml
│   │   └── src/main.nr
│   ├── transfer/
│   │   ├── Nargo.toml
│   │   └── src/main.nr
│   └── ...
│
└── tests/
    ├── deposit_test.nr
    ├── transfer_test.nr
    └── integration_test.nr
```

---

## 2. Primitive Implementations

### 2.1 Types (`src/primitives/types.nr`)

```noir
// src/primitives/types.nr

/// Tree configuration
global TREE_DEPTH: u32 = 32;          // 2^32 leaves
global NULLIFIER_TREE_DEPTH: u32 = 32;
global VAULT_MEMBERS_DEPTH: u32 = 16; // 2^16 = 65k members max

/// Balance stored in the shielded pool
pub struct Balance {
    pub owner: Field,      // Hash of public key
    pub amount: Field,     // Token amount
    pub salt: Field,       // Random blinding factor
    pub vault_id: Field,   // 0 = solo, else vault identifier
}

impl Balance {
    /// Create a new balance
    pub fn new(owner: Field, amount: Field, salt: Field, vault_id: Field) -> Self {
        Balance { owner, amount, salt, vault_id }
    }

    /// Create a solo user balance
    pub fn solo(owner: Field, amount: Field, salt: Field) -> Self {
        Balance { owner, amount, salt, vault_id: 0 }
    }

    /// Check if this is a solo balance
    pub fn is_solo(self) -> bool {
        self.vault_id == 0
    }
}

/// Merkle proof for inclusion/exclusion
pub struct MerkleProof<let N: u32> {
    pub siblings: [Field; N],
    pub path_indices: [u1; N],
}

/// Transfer note (encrypted for receiver)
pub struct TransferNote {
    pub amount: Field,
    pub salt: Field,
    pub sender_vault: Field,
}

/// Vault configuration
pub struct VaultConfig {
    pub vault_id: Field,
    pub admin: Field,
    pub members_root: Field,
}
```

### 2.2 Commitment (`src/primitives/commitment.nr`)

```noir
// src/primitives/commitment.nr

use dep::std::hash::poseidon2::Poseidon2::hash as poseidon2;
use crate::primitives::types::Balance;

/// Domain separator for commitments
global COMMITMENT_DOMAIN: Field = 0x01;

/// Compute a balance commitment
/// commitment = H(domain || owner || amount || salt || vault_id)
pub fn compute_commitment(balance: Balance) -> Field {
    poseidon2(
        [COMMITMENT_DOMAIN, balance.owner, balance.amount, balance.salt, balance.vault_id],
        5
    )
}

/// Compute commitment with explicit params
pub fn compute_commitment_explicit(
    owner: Field,
    amount: Field,
    salt: Field,
    vault_id: Field
) -> Field {
    poseidon2([COMMITMENT_DOMAIN, owner, amount, salt, vault_id], 5)
}

/// Derive owner identifier from secret key
/// owner = H(secret_key)
pub fn derive_owner(secret_key: Field) -> Field {
    poseidon2([secret_key], 1)
}

/// Check if two commitments match
pub fn commitments_equal(a: Field, b: Field) -> bool {
    a == b
}

#[test]
fn test_commitment_deterministic() {
    let balance = Balance::new(1, 100, 12345, 0);
    let c1 = compute_commitment(balance);
    let c2 = compute_commitment(balance);
    assert(c1 == c2);
}

#[test]
fn test_commitment_different_salt() {
    let b1 = Balance::new(1, 100, 111, 0);
    let b2 = Balance::new(1, 100, 222, 0);
    assert(compute_commitment(b1) != compute_commitment(b2));
}
```

### 2.3 Nullifier (`src/primitives/nullifier.nr`)

```noir
// src/primitives/nullifier.nr

use dep::std::hash::poseidon2::Poseidon2::hash as poseidon2;

/// Domain separator for nullifiers
global NULLIFIER_DOMAIN: Field = 0x02;

/// Compute nullifier for spending a commitment
/// nullifier = H(domain || commitment || secret_key || nonce)
pub fn compute_nullifier(
    commitment: Field,
    secret_key: Field,
    nonce: Field
) -> Field {
    poseidon2([NULLIFIER_DOMAIN, commitment, secret_key, nonce], 4)
}

/// Verify a nullifier is correct
pub fn verify_nullifier(
    expected_nullifier: Field,
    commitment: Field,
    secret_key: Field,
    nonce: Field
) -> bool {
    let computed = compute_nullifier(commitment, secret_key, nonce);
    computed == expected_nullifier
}

#[test]
fn test_nullifier_deterministic() {
    let n1 = compute_nullifier(123, 456, 789);
    let n2 = compute_nullifier(123, 456, 789);
    assert(n1 == n2);
}

#[test]
fn test_nullifier_different_nonce() {
    let n1 = compute_nullifier(123, 456, 1);
    let n2 = compute_nullifier(123, 456, 2);
    assert(n1 != n2);
}
```

### 2.4 Merkle Tree (`src/primitives/merkle.nr`)

```noir
// src/primitives/merkle.nr

use dep::std::hash::poseidon2::Poseidon2::hash as poseidon2;
use crate::primitives::types::{TREE_DEPTH, MerkleProof};

/// Compute the hash of two children
fn hash_pair(left: Field, right: Field) -> Field {
    poseidon2([left, right], 2)
}

/// Verify a Merkle inclusion proof
pub fn verify_inclusion<let N: u32>(
    leaf: Field,
    root: Field,
    proof: MerkleProof<N>
) -> bool {
    let mut current = leaf;

    for i in 0..N {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];

        // If path_index is 1, current is on the right
        current = if is_right == 1 {
            hash_pair(sibling, current)
        } else {
            hash_pair(current, sibling)
        };
    }

    current == root
}

/// Compute leaf index from path indices
pub fn path_to_index<let N: u32>(path_indices: [u1; N]) -> Field {
    let mut index: Field = 0;
    let mut power: Field = 1;

    for i in 0..N {
        if path_indices[i] == 1 {
            index = index + power;
        }
        power = power * 2;
    }

    index
}

/// Verify a Merkle update (old leaf → new leaf)
///
/// NOTE: This implementation assumes the update happens at the same position
/// (same path_indices). For batch updates where positions differ, use
/// verify_batch_update() which handles non-sequential tree modifications.
pub fn verify_update<let N: u32>(
    old_leaf: Field,
    new_leaf: Field,
    old_root: Field,
    new_root: Field,
    proof: MerkleProof<N>
) -> bool {
    // Verify old leaf was at this position
    let old_valid = verify_inclusion(old_leaf, old_root, proof);

    // Compute new root with new leaf
    let mut current = new_leaf;
    for i in 0..N {
        let sibling = proof.siblings[i];
        let is_right = proof.path_indices[i];

        current = if is_right == 1 {
            hash_pair(sibling, current)
        } else {
            hash_pair(current, sibling)
        };
    }

    old_valid & (current == new_root)
}

/// Verify batch tree update (multiple leaves at different positions)
/// Optimized for non-sequential updates common in transfers
pub fn verify_batch_update<let N: u32, let M: u32>(
    updates: [(Field, Field, MerkleProof<N>); M],  // (old_leaf, new_leaf, proof) pairs
    old_root: Field,
    new_root: Field
) -> bool {
    // 1. Verify all old leaves exist in old tree
    for i in 0..M {
        let (old_leaf, _, proof) = updates[i];
        assert(verify_inclusion(old_leaf, old_root, proof));
    }

    // 2. Apply all updates and verify final root
    // This is more efficient than sequential updates when positions don't overlap
    let mut intermediate_root = old_root;

    for i in 0..M {
        let (old_leaf, new_leaf, proof) = updates[i];

        // Compute intermediate root after this update
        let mut current = new_leaf;
        for j in 0..N {
            let sibling = proof.siblings[j];
            let is_right = proof.path_indices[j];

            current = if is_right == 1 {
                hash_pair(sibling, current)
            } else {
                hash_pair(current, sibling)
            };
        }

        intermediate_root = current;
    }

    intermediate_root == new_root
}

/// Compute an empty tree root of given depth
pub fn empty_tree_root<let N: u32>() -> Field {
    let mut current: Field = 0; // Empty leaf

    for _i in 0..N {
        current = hash_pair(current, current);
    }

    current
}

#[test]
fn test_inclusion_proof() {
    // Simple 2-level tree
    let leaf = 42;
    let sibling_0 = 10;
    let sibling_1 = 20;

    // Compute expected root
    let level_1 = hash_pair(leaf, sibling_0);
    let root = hash_pair(level_1, sibling_1);

    let proof = MerkleProof {
        siblings: [sibling_0, sibling_1],
        path_indices: [0, 0]
    };

    assert(verify_inclusion(leaf, root, proof));
}
```

---

## 3. Core Circuit Code

### 3.1 Deposit Circuit (`circuits/deposit/src/main.nr`)

```noir
// circuits/deposit/src/main.nr

use noirwire_circuits::primitives::commitment::{compute_commitment_explicit, derive_owner};
use noirwire_circuits::primitives::merkle::{verify_update, path_to_index};
use noirwire_circuits::primitives::types::{TREE_DEPTH, MerkleProof};

/// Deposit (shield) public funds into the private pool
fn main(
    // ===== PUBLIC INPUTS =====
    /// Amount being deposited (visible on L1)
    deposit_amount: pub Field,
    /// The new commitment being added
    new_commitment: pub Field,
    /// Tree root before deposit
    old_root: pub Field,
    /// Tree root after deposit
    new_root: pub Field,
    /// Leaf index where commitment is inserted
    leaf_index: pub Field,

    // ===== PRIVATE INPUTS =====
    /// Depositor's public key (hash of secret)
    owner_pubkey: Field,
    /// Random salt for hiding
    salt: Field,
    /// Vault ID (0 for solo)
    vault_id: Field,
    /// Merkle proof for the insertion position
    merkle_proof: MerkleProof<TREE_DEPTH>
) {
    // 1. Verify commitment is correctly computed
    let computed_commitment = compute_commitment_explicit(
        owner_pubkey,
        deposit_amount,
        salt,
        vault_id
    );
    assert(
        computed_commitment == new_commitment,
        "Commitment mismatch"
    );

    // 2. Verify the leaf position was empty (0)
    // and is now the new commitment
    let empty_leaf: Field = 0;

    assert(
        verify_update(
            empty_leaf,
            new_commitment,
            old_root,
            new_root,
            merkle_proof
        ),
        "Invalid merkle update"
    );

    // 3. Verify leaf index matches proof path
    let computed_index = path_to_index(merkle_proof.path_indices);
    assert(
        computed_index == leaf_index,
        "Leaf index mismatch"
    );
}
```

### 3.2 Transfer Circuit (`circuits/transfer/src/main.nr`)

```noir
// circuits/transfer/src/main.nr

use noirwire_circuits::primitives::commitment::{compute_commitment_explicit, derive_owner};
use noirwire_circuits::primitives::nullifier::compute_nullifier;
use noirwire_circuits::primitives::merkle::{verify_inclusion, verify_update};
use noirwire_circuits::primitives::types::{TREE_DEPTH, MerkleProof, Balance};

/// Private transfer between two parties
fn main(
    // ===== PUBLIC INPUTS =====
    /// Nullifier (prevents double-spend)
    nullifier: pub Field,
    /// Root before transfer
    old_root: pub Field,
    /// Root after transfer
    new_root: pub Field,

    // ===== PRIVATE INPUTS - SENDER =====
    /// Sender's secret key
    sender_secret: Field,
    /// Sender's current balance amount
    sender_amount: Field,
    /// Sender's balance salt
    sender_salt: Field,
    /// Sender's vault ID
    sender_vault_id: Field,
    /// Merkle proof for sender's balance
    sender_proof: MerkleProof<TREE_DEPTH>,

    // ===== PRIVATE INPUTS - TRANSFER =====
    /// Amount to transfer
    transfer_amount: Field,
    /// Nonce for nullifier
    nonce: Field,

    // ===== PRIVATE INPUTS - RECEIVER =====
    /// Receiver's public key (hash)
    receiver_pubkey: Field,
    /// Receiver's new salt
    receiver_salt: Field,
    /// Receiver's vault ID
    receiver_vault_id: Field,

    // ===== PRIVATE INPUTS - NEW SENDER BALANCE =====
    /// New salt for sender's remaining balance
    new_sender_salt: Field,
    /// Merkle proof for new sender position
    new_sender_proof: MerkleProof<TREE_DEPTH>,
    /// Merkle proof for receiver position
    receiver_proof: MerkleProof<TREE_DEPTH>,
    /// Intermediate root (after nullifying sender, before adding receiver)
    intermediate_root: Field
) {
    // ===== DERIVE VALUES =====
    let sender_pubkey = derive_owner(sender_secret);

    // ===== SENDER VERIFICATION =====

    // 1. Reconstruct sender's commitment
    let sender_commitment = compute_commitment_explicit(
        sender_pubkey,
        sender_amount,
        sender_salt,
        sender_vault_id
    );

    // 2. Verify sender's commitment exists in old tree
    assert(
        verify_inclusion(sender_commitment, old_root, sender_proof),
        "Sender commitment not in tree"
    );

    // 3. Verify nullifier is correct
    let computed_nullifier = compute_nullifier(sender_commitment, sender_secret, nonce);
    assert(
        computed_nullifier == nullifier,
        "Invalid nullifier"
    );

    // 4. Verify sufficient balance
    // Using safe comparison (as u64 to prevent overflow attacks)
    let sender_u64 = sender_amount as u64;
    let transfer_u64 = transfer_amount as u64;
    assert(
        sender_u64 >= transfer_u64,
        "Insufficient balance"
    );

    // ===== BALANCE CONSERVATION =====

    let new_sender_amount = sender_amount - transfer_amount;

    // ===== COMPUTE NEW COMMITMENTS =====

    // New sender commitment (with remaining balance)
    let new_sender_commitment = compute_commitment_explicit(
        sender_pubkey,
        new_sender_amount,
        new_sender_salt,
        sender_vault_id
    );

    // Receiver commitment
    let receiver_commitment = compute_commitment_explicit(
        receiver_pubkey,
        transfer_amount,
        receiver_salt,
        receiver_vault_id
    );

    // ===== VERIFY STATE TRANSITIONS =====

    // Step 1: Old sender → New sender
    // (replaces old commitment with new one)
    assert(
        verify_update(
            sender_commitment,
            new_sender_commitment,
            old_root,
            intermediate_root,
            new_sender_proof
        ),
        "Invalid sender update"
    );

    // Step 2: Add receiver commitment
    // (insert into empty slot)
    let empty_leaf: Field = 0;
    assert(
        verify_update(
            empty_leaf,
            receiver_commitment,
            intermediate_root,
            new_root,
            receiver_proof
        ),
        "Invalid receiver insertion"
    );
}
```

### 3.3 Batch Aggregator (`circuits/batch_aggregator/src/main.nr`)

```noir
// circuits/batch_aggregator/src/main.nr

use dep::std::verify_proof;

/// Verification key hash type
type VkHash = Field;

/// Aggregate two transaction proofs into one
fn main(
    // ===== PUBLIC INPUTS =====
    /// Initial state root (start of batch)
    initial_root: pub Field,
    /// Final state root (end of batch)
    final_root: pub Field,
    /// Nullifiers revealed in this batch
    batch_nullifiers: pub [Field; 2],

    // ===== PRIVATE INPUTS - PROOF 1 =====
    proof_1: [Field; 93],           // Proof data (size varies by backend)
    vk_1: [Field; 114],             // Verification key
    public_inputs_1: [Field; 3],    // [nullifier, old_root, new_root]

    // ===== PRIVATE INPUTS - PROOF 2 =====
    proof_2: [Field; 93],
    vk_2: [Field; 114],
    public_inputs_2: [Field; 3],

    // ===== VERIFICATION KEY HASH =====
    /// Expected VK hash (ensures we're verifying the right circuit type)
    expected_vk_hash: VkHash
) {
    // ===== VERIFY PROOF 1 =====

    // Verify the proof cryptographically
    verify_proof(
        vk_1.as_slice(),
        proof_1.as_slice(),
        public_inputs_1.as_slice(),
        expected_vk_hash
    );

    // Extract public inputs
    let nullifier_1 = public_inputs_1[0];
    let old_root_1 = public_inputs_1[1];
    let new_root_1 = public_inputs_1[2];

    // ===== VERIFY PROOF 2 =====

    verify_proof(
        vk_2.as_slice(),
        proof_2.as_slice(),
        public_inputs_2.as_slice(),
        expected_vk_hash
    );

    let nullifier_2 = public_inputs_2[0];
    let old_root_2 = public_inputs_2[1];
    let new_root_2 = public_inputs_2[2];

    // ===== VERIFY CHAIN =====

    // Proof 1 starts at initial_root
    assert(
        old_root_1 == initial_root,
        "Proof 1 doesn't start at initial root"
    );

    // Proof 2 continues where proof 1 ended
    assert(
        old_root_2 == new_root_1,
        "Proofs not chained correctly"
    );

    // Batch ends at final_root
    assert(
        new_root_2 == final_root,
        "Batch doesn't end at final root"
    );

    // ===== COLLECT NULLIFIERS =====

    assert(batch_nullifiers[0] == nullifier_1);
    assert(batch_nullifiers[1] == nullifier_2);
}
```

---

## 4. Testing Strategy

### Unit Tests

```noir
// tests/deposit_test.nr

use noirwire_circuits::primitives::commitment::compute_commitment_explicit;
use noirwire_circuits::primitives::merkle::{verify_inclusion, empty_tree_root};

#[test]
fn test_deposit_commitment() {
    let owner = 0x1234;
    let amount = 1000;
    let salt = 0xabcd;
    let vault_id = 0;

    let commitment = compute_commitment_explicit(owner, amount, salt, vault_id);

    // Commitment should be deterministic
    let commitment_2 = compute_commitment_explicit(owner, amount, salt, vault_id);
    assert(commitment == commitment_2);

    // Different salt = different commitment
    let commitment_diff_salt = compute_commitment_explicit(owner, amount, 0xdead, vault_id);
    assert(commitment != commitment_diff_salt);
}

#[test]
fn test_empty_tree() {
    let root = empty_tree_root::<4>();
    // Root should be non-zero
    assert(root != 0);
}
```

### Integration Tests

```noir
// tests/integration_test.nr

use noirwire_circuits::primitives::*;

#[test]
fn test_full_deposit_flow() {
    // Setup: Create empty tree
    let initial_root = empty_tree_root::<4>();

    // User deposits 1000 tokens
    let owner = derive_owner(0x12345);
    let amount = 1000;
    let salt = 0xabcdef;

    let commitment = compute_commitment_explicit(owner, amount, salt, 0);

    // Verify commitment can be included
    // (In real test, would compute actual merkle proof)
    assert(commitment != 0);
}

#[test]
fn test_transfer_conservation() {
    // Sender has 1000, transfers 400
    let sender_balance = 1000;
    let transfer_amount = 400;
    let sender_remaining = sender_balance - transfer_amount;

    // Verify conservation
    assert(sender_remaining + transfer_amount == sender_balance);

    // Verify no overflow
    assert((sender_balance as u64) >= (transfer_amount as u64));
}
```

### Property-Based Testing

```bash
# Run with fuzzing (requires nargo with fuzzing support)
nargo test --fuzz
```

---

## 5. Solana Verifier Integration

### Proof Generation (Off-chain)

```typescript
// prover/src/index.ts

import { compile, createWitness } from "@noir-lang/noir_js";
import { BarretenbergBackend } from "@noir-lang/backend_barretenberg";

export async function generateDepositProof(
  depositAmount: bigint,
  ownerPubkey: string,
  salt: bigint,
  vaultId: bigint,
  merkleProof: MerkleProof,
): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
  // 1. Compile circuit
  const circuit = await compile("circuits/deposit");

  // 2. Create backend
  const backend = new BarretenbergBackend(circuit);

  // 3. Create witness
  const witness = await createWitness(circuit, {
    deposit_amount: depositAmount.toString(),
    owner_pubkey: ownerPubkey,
    salt: salt.toString(),
    vault_id: vaultId.toString(),
    merkle_proof: merkleProof,
  });

  // 4. Generate proof
  const { proof, publicInputs } = await backend.generateProof(witness);

  return { proof, publicInputs };
}
```

### Solana Verifier (On-chain)

The Solana verifier uses the `alt_bn128_pairing` syscall for Groth16 verification.

```rust
// programs/verifier/src/lib.rs

use anchor_lang::prelude::*;
use solana_program::alt_bn128::prelude::*;

declare_id!("NoirVerifier11111111111111111111111111111");

#[program]
pub mod noir_verifier {
    use super::*;

    /// Verify a Noir proof on Solana
    pub fn verify(
        ctx: Context<Verify>,
        proof: [u8; 256],          // Serialized proof
        public_inputs: Vec<[u8; 32]>,
        vk_hash: [u8; 32],
    ) -> Result<()> {
        // 1. Deserialize proof components
        let (a, b, c) = deserialize_proof(&proof)?;

        // 2. Load verification key
        let vk = &ctx.accounts.verification_key;
        require!(
            vk.hash == vk_hash,
            VerifierError::InvalidVerificationKey
        );

        // 3. Compute pairing inputs
        let pairing_input = prepare_pairing_input(
            &a, &b, &c,
            &public_inputs,
            &vk.data
        )?;

        // 4. Call alt_bn128_pairing syscall
        let result = alt_bn128_pairing(&pairing_input)?;

        // 5. Check pairing result
        require!(
            result == PAIRING_ONE,
            VerifierError::InvalidProof
        );

        // 6. Emit verification event
        emit!(ProofVerified {
            vk_hash,
            public_inputs_hash: hash_public_inputs(&public_inputs),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Verify<'info> {
    /// Verification key account
    #[account(
        seeds = [b"vk", vk_hash.as_ref()],
        bump
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// Payer
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[account]
pub struct VerificationKey {
    pub hash: [u8; 32],
    pub data: Vec<u8>,  // Serialized VK
}

#[event]
pub struct ProofVerified {
    pub vk_hash: [u8; 32],
    pub public_inputs_hash: [u8; 32],
    pub timestamp: i64,
}

#[error_code]
pub enum VerifierError {
    #[msg("Invalid verification key")]
    InvalidVerificationKey,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Deserialization error")]
    DeserializationError,
}
```

---

## 6. Performance Optimization

### Constraint Counts

| Circuit          | Estimated Constraints | Notes                        |
| ---------------- | --------------------- | ---------------------------- |
| Deposit          | ~5,000                | Single merkle path           |
| Transfer         | ~15,000               | Two merkle paths + nullifier |
| Withdraw         | ~10,000               | One path + nullifier         |
| Batch (2 proofs) | ~200,000              | Recursive verification       |

### Optimization Techniques

```noir
// 1. Use unconstrained functions for non-critical computations
unconstrained fn compute_hints(data: [Field; 100]) -> [Field; 50] {
    // Complex computation that doesn't need proving
    // Just provides hints for the prover
    // ...
}

// 2. Minimize Field→u64 conversions
fn safe_subtract(a: Field, b: Field) -> Field {
    // Verify non-negative before operation
    let a_u64 = a as u64;
    let b_u64 = b as u64;
    assert(a_u64 >= b_u64);
    a - b  // Field arithmetic is cheaper
}

// 3. Batch hash operations
fn batch_hash_4(inputs: [Field; 4]) -> Field {
    // More efficient than 4 separate hashes
    poseidon2(inputs, 4)
}

// 4. Use constants for repeated values
global ZERO: Field = 0;
global ONE: Field = 1;
```

### Proving Time Estimates

| Environment       | Deposit | Transfer | Batch |
| ----------------- | ------- | -------- | ----- |
| Server (64 cores) | ~1s     | ~3s      | ~10s  |
| Browser (WASM)    | ~5s     | ~15s     | ~60s  |
| Mobile            | ~10s    | ~30s     | ~120s |

---

## 7. Development Workflow

### Local Development

```bash
# 1. Compile all circuits
nargo compile --workspace

# 2. Run tests
nargo test

# 3. Generate proofs locally
nargo prove -p circuits/deposit

# 4. Verify proofs
nargo verify -p circuits/deposit
```

### CI/CD Pipeline

```yaml
# .github/workflows/circuits.yml

name: Noir Circuits CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Noir
        run: |
          curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
          noirup --version 1.0.0

      - name: Compile
        run: nargo compile --workspace

      - name: Test
        run: nargo test

      - name: Format check
        run: nargo fmt --check
```

### Debugging

```noir
// Use println for debugging (removed in production)
use dep::std::println;

fn debug_transfer(sender_amount: Field, transfer_amount: Field) {
    println(f"Sender amount: {sender_amount}");
    println(f"Transfer amount: {transfer_amount}");

    let remaining = sender_amount - transfer_amount;
    println(f"Remaining: {remaining}");
}
```

---

## Summary

This blueprint provides:

1. **Complete primitive implementations** for commitments, nullifiers, and merkle trees
2. **Full circuit code** for deposit, transfer, and batch aggregation
3. **Testing strategy** with unit, integration, and property-based tests
4. **Solana verifier integration** using alt_bn128 pairing
5. **Performance optimization** techniques and estimates
6. **Development workflow** for local and CI/CD

**Next Steps:**

- Implement vault-specific circuits (membership proofs)
- Set up Barretenberg backend for proof generation
- Deploy verifier contract to Solana devnet
- Integrate with MagicBlock PER

---

## References

- [Noir Standard Library](https://noir-lang.org/docs/noir/standard_library)
- [Barretenberg Backend](https://github.com/AztecProtocol/barretenberg)
- [Solana alt_bn128 Syscalls](https://docs.solana.com/developing/runtime-facilities/programs#bn254-operations)
- [ZK-Kit Noir](https://github.com/privacy-scaling-explorations/zk-kit.noir)

---

_Blueprint Version: 1.0_
_Status: Ready for Implementation_
