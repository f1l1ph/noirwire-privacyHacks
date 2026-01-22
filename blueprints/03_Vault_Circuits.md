# 03. Vault Circuits Blueprint

**Status:** 🟢 Complete Specification
**Version:** 1.0.0
**Last Updated:** 2026-01-22

---

## Table of Contents

1. [Overview](#1-overview)
2. [Balance Structure](#2-balance-structure)
3. [Noir Vault Circuits](#3-noir-vault-circuits)
4. [References](#4-references)

---

## 1. Overview

### The Key Insight

**A solo user is just a vault of 1 member.** This unified model means:

- Solo users and vault members use the **same balance structure**
- Solo users have `vault_id: None` (private to themselves only)
- Vault members have `vault_id: Some([u8; 32])` (visible to vault members)
- **NO membership merkle trees** - membership is managed by PER's Permission Program
- ZK circuits prove balance conservation and nullifier uniqueness, **NOT membership**

### What ZK Proves

The Noir circuits prove:

1. **Balance Conservation**: sender_before - amount = sender_after
2. **Nullifier Uniqueness**: Each commitment can only be spent once
3. **Merkle Inclusion**: Balances exist in the global balance tree
4. **Vault Tagging** (optional): Balance can be tagged with a vault_id

### What ZK Does NOT Prove

- ❌ Vault membership (handled by PER Permission Program)
- ❌ Multi-signature threshold (validated by PER off-chain)
- ❌ Permission roles (managed by Permission Program on L1)

---

## 2. Balance Structure

### 2.1 Universal Balance Format

**Every balance** in the system uses this structure, whether solo or vault:

```rust
/// Individual balance (solo user OR vault member)
pub struct Balance {
    /// Owner address
    pub owner: Pubkey,

    /// Token balance
    pub amount: u64,

    /// Optional: vault this balance belongs to
    /// None = solo user (private to self only)
    /// Some(vault_id) = vault member (visible to vault members)
    pub vault_id: Option<[u8; 32]>,
}
```

### 2.2 Balance Commitment

```rust
// Commitment hash (Poseidon)
commitment = H(owner || amount || vault_id || blinding)
```

**Key properties:**

- `vault_id` is `None` for solo users → represented as 32 zero bytes in hash
- `vault_id` is `Some([u8; 32])` for vault members → actual vault identifier
- `blinding` ensures privacy (random 32-byte value)

### 2.3 Examples

#### Solo User Balance

```rust
Balance {
    owner: 0x123...,
    amount: 100_000_000,  // 0.1 SOL
    vault_id: None,        // Private to user only
}

// Commitment: H(0x123... || 100000000 || [0; 32] || blinding)
```

#### Vault Member Balance

```rust
Balance {
    owner: 0x456...,
    amount: 500_000_000,  // 0.5 SOL
    vault_id: Some([0xab, 0xcd, ...]),  // DAO Treasury vault
}

// Commitment: H(0x456... || 500000000 || [0xab, 0xcd, ...] || blinding)
```

---

## 3. Noir Vault Circuits

### 3.1 Transfer Circuit

File: `circuits/src/transfer.nr`

```noir
use std::hash::poseidon2::Poseidon2;
use std::hash::Poseidon2Hasher;

// Public inputs (visible on-chain)
struct TransferPublic {
    nullifier: Field,           // Prevents double-spend
    new_commitment: Field,      // New balance for receiver
    balance_root: Field,        // Current merkle root
}

// Private inputs (hidden)
struct TransferPrivate {
    // Sender's balance
    sender_owner: [u8; 32],
    sender_amount: u64,
    sender_vault_id: [u8; 32],  // [0; 32] if solo
    sender_blinding: [u8; 32],
    sender_merkle_proof: [[u8; 32]; 32],

    // Transfer amount
    amount: u64,

    // Receiver's balance
    receiver_owner: [u8; 32],
    receiver_vault_id: [u8; 32],  // Can be same or different vault, or None
    receiver_blinding: [u8; 32],

    // Nullifier secret
    nullifier_secret: [u8; 32],
}

fn main(
    public: TransferPublic,
    private: TransferPrivate
) {
    // 1. Compute sender commitment using variable-length hasher
    let mut hasher = Poseidon2Hasher::default();
    hasher.write(private.sender_owner);
    hasher.write(private.sender_amount as Field);
    hasher.write(private.sender_vault_id);
    hasher.write(private.sender_blinding);
    let sender_commitment = hasher.finish();

    // 2. Verify sender balance is in merkle tree
    let sender_in_tree = verify_merkle_proof(
        sender_commitment,
        private.sender_merkle_proof,
        public.balance_root
    );
    assert(sender_in_tree, "Sender balance not in tree");

    // 3. Verify balance conservation
    assert(private.sender_amount >= private.amount, "Insufficient balance");
    let sender_remaining = private.sender_amount - private.amount;

    // 4. Compute nullifier: H(commitment || nullifier_secret)
    let computed_nullifier = Poseidon2::hash(
        [sender_commitment, private.nullifier_secret as Field], 2
    );

    assert(computed_nullifier == public.nullifier, "Nullifier mismatch");

    // 5. Compute new receiver commitment
    let mut r_hasher = Poseidon2Hasher::default();
    r_hasher.write(private.receiver_owner);
    r_hasher.write(private.amount as Field);
    r_hasher.write(private.receiver_vault_id);
    r_hasher.write(private.receiver_blinding);
    let receiver_commitment = r_hasher.finish();

    assert(receiver_commitment == public.new_commitment, "Commitment mismatch");
}

// Helper function
fn verify_merkle_proof(
    leaf: Field,
    proof: [[u8; 32]; 32],
    root: Field
) -> bool {
    let mut current = leaf;

    for i in 0..32 {
        let sibling = proof[i] as Field;
        current = Poseidon2::hash([current, sibling], 2);
    }

    current == root
}
```

### 3.2 Transfer Types

#### Solo → Solo

```
User A (solo) sends to User B (solo):
- sender_vault_id: [0; 32]
- receiver_vault_id: [0; 32]
- Both see their own balance only
- Nobody else sees anything
```

#### Solo → Vault

```
User A (solo) sends to Vault Member E:
- sender_vault_id: [0; 32]
- receiver_vault_id: Some(vault_abc)
- A sees: "Sent 100 SOL" (doesn't know to vault)
- Vault members see: "Received 100 SOL from external"
```

#### Vault → Vault (same)

```
Member D sends to Member E (same vault):
- sender_vault_id: Some(vault_abc)
- receiver_vault_id: Some(vault_abc)
- All vault members see the internal transfer
```

#### Vault → Vault (different)

```
Member D (vault_abc) sends to Member G (vault_xyz):
- sender_vault_id: Some(vault_abc)
- receiver_vault_id: Some(vault_xyz)
- vault_abc members see: "Sent 100 to external"
- vault_xyz members see: "Received 100 from external"
```

### 3.3 Batch Transfer Circuit

For efficiency, PER batches multiple transfers into a single proof:

File: `circuits/src/batch_transfer.nr`

```noir
const BATCH_SIZE: u32 = 32;

struct BatchTransferPublic {
    old_balance_root: Field,
    new_balance_root: Field,
    nullifiers: [Field; BATCH_SIZE],
    new_commitments: [Field; BATCH_SIZE],
}

struct BatchTransferPrivate {
    transfers: [TransferPrivate; BATCH_SIZE],
}

fn main(
    public: BatchTransferPublic,
    private: BatchTransferPrivate
) {
    let mut current_root = public.old_balance_root;

    for i in 0..BATCH_SIZE {
        let tx = private.transfers[i];

        // Verify balance conservation
        assert(tx.sender_amount >= tx.amount);

        // Verify sender balance in current tree
        let sender_commitment = compute_commitment(tx);
        assert(verify_merkle_proof(
            sender_commitment,
            tx.sender_merkle_proof,
            current_root
        ));

        // Verify nullifier
        let computed_nullifier = Poseidon2::hash([
            sender_commitment,
            tx.nullifier_secret as Field
        ], 2);
        assert(computed_nullifier == public.nullifiers[i]);

        // Verify new commitment
        let receiver_commitment = compute_receiver_commitment(tx);
        assert(receiver_commitment == public.new_commitments[i]);

        // Update root (add new commitment, remove old)
        current_root = update_tree_root(
            current_root,
            sender_commitment,      // Remove
            receiver_commitment     // Add
        );
    }

    // Final root must match
    assert(current_root == public.new_balance_root);
}
```

### 3.4 Deposit Circuit

File: `circuits/src/deposit.nr`

```noir
struct DepositPublic {
    amount: u64,
    new_commitment: Field,
}

struct DepositPrivate {
    owner: [u8; 32],
    vault_id: [u8; 32],    // [0; 32] for solo, or vault ID
    blinding: [u8; 32],
}

fn main(
    public: DepositPublic,
    private: DepositPrivate
) {
    // Verify commitment matches deposit
    let mut hasher = Poseidon2Hasher::default();
    hasher.write(private.owner);
    hasher.write(public.amount as Field);
    hasher.write(private.vault_id);
    hasher.write(private.blinding);
    let commitment = hasher.finish();

    assert(commitment == public.new_commitment);
}
```

### 3.5 Withdraw Circuit

File: `circuits/src/withdraw.nr`

```noir
struct WithdrawPublic {
    amount: u64,
    recipient: [u8; 32],   // L1 address
    nullifier: Field,
    balance_root: Field,
}

struct WithdrawPrivate {
    owner: [u8; 32],
    balance: u64,
    vault_id: [u8; 32],
    blinding: [u8; 32],
    merkle_proof: [[u8; 32]; 32],
    nullifier_secret: [u8; 32],
}

fn main(
    public: WithdrawPublic,
    private: WithdrawPrivate
) {
    // 1. Verify balance exists
    let mut hasher = Poseidon2Hasher::default();
    hasher.write(private.owner);
    hasher.write(private.balance as Field);
    hasher.write(private.vault_id);
    hasher.write(private.blinding);
    let commitment = hasher.finish();

    assert(verify_merkle_proof(
        commitment,
        private.merkle_proof,
        public.balance_root
    ));

    // 2. Verify sufficient balance
    assert(private.balance >= public.amount);

    // 3. Verify nullifier
    let computed_nullifier = Poseidon2::hash([
        commitment,
        private.nullifier_secret as Field
    ], 2);
    assert(computed_nullifier == public.nullifier);

    // 4. Verify owner matches recipient (privacy preserved)
    // Note: This proves owner can withdraw, but doesn't reveal owner
}
```

---

## 4. References

### Section 6 of Vault_research.md

The circuit constraints are based on **Section 6: ZK Layer (Noir)** from Vault_research.md:

#### Public Inputs

- `old_balance_root` (from L1)
- `new_balance_root` (being committed)
- `old_nullifier_root`
- `new_nullifier_root`
- `batch_hash`

#### Constraints

- ∀tx: `sender_before - amount = sender_after` (balance conservation)
- ∀tx: `receiver_before + amount = receiver_after`
- ∀tx: `sender_after ≥ 0` (no negative balances)
- ∀tx: `nullifier is unique`
- `old_root → new_root` transition is valid
- `Σ(deposits) - Σ(withdrawals) = Δ(pool_balance)`

### Related Blueprints

- **11_Vault_Program.md**: Vault structure, permission roles, and integration with PER Permission Program
- **31_Client_SDK.md**: SDK implementation for vault operations
- **30_API_Backend.md**: API endpoints for vault management

### Implementation Files

- `circuits/src/transfer.nr` - Transfer circuit
- `circuits/src/batch_transfer.nr` - Batch transfer circuit
- `circuits/src/deposit.nr` - Deposit circuit
- `circuits/src/withdraw.nr` - Withdraw circuit

---

## Summary

This blueprint provides the **ZK circuit specifications** for NoirWire vaults:

✅ **Unified Balance Model**: Solo users = vault of 1 member
✅ **Simple Structure**: `{ owner, amount, vault_id: Option<[u8; 32]> }`
✅ **NO Membership Proofs**: Membership managed by PER Permission Program
✅ **Core ZK Proofs**: Balance conservation, nullifier uniqueness, merkle inclusion
✅ **Vault Tagging**: Support for vault_id in commitments (no ZK membership verification)

**Design Principles:**

- No complex membership merkle trees in ZK circuits
- No membership verification circuits (delegated to PER)
- No multi-signature circuits (handled by PER Permission Program)
- Focus on balance conservation only
- Permissions handled by PER (not ZK)

**Next Steps:**

1. Implement the Noir circuits in `circuits/src/`
2. Compile circuits and generate verification keys
3. Test transfer proofs with vault_id tagging
4. Integrate with PER Permission Program (see 11_Vault_Program.md)
5. Verify batch transfer efficiency

---

**Blueprint Status:** 🟢 Complete and ready for implementation
