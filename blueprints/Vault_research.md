# Shielded Pool + Vaults — Combined Architecture

## Executive Summary

A **hybrid privacy system** that combines:

1. **Shielded Pool** (Railgun-style) — Anyone can deposit and become private. Solo users can't see each other.
2. **Vaults** (opt-in) — Groups/DAOs/institutions can create shared vaults within the pool where members CAN see each other's balances.

**The key insight:** A solo user is just a "vault of 1" — same system, different permission settings.

> **Use Cases:** See [/resources/usecases.md](../resources/usecases.md) for 30+ applications.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PUBLIC SOLANA L1                           │
│                    (everyone can see)                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ deposit (shield) / withdraw (unshield)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    SHIELDED POOL (PER + Noir)                   │
│                   (private execution layer)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     SOLO USERS                           │  │
│  │              (can't see each other)                      │  │
│  │                                                          │  │
│  │    ┌─────────┐   ┌─────────┐   ┌─────────┐              │  │
│  │    │ User A  │   │ User B  │   │ User C  │   ...        │  │
│  │    │ (solo)  │   │ (solo)  │   │ (solo)  │              │  │
│  │    │ 500 SOL │   │ 200 SOL │   │ 50 SOL  │              │  │
│  │    └─────────┘   └─────────┘   └─────────┘              │  │
│  │         │                                                │  │
│  │         │ private transfer (nobody sees)                 │  │
│  │         └────────────────────────────────────────────►   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                       VAULTS                             │  │
│  │           (members see each other inside)                │  │
│  │                                                          │  │
│  │  ┌────────────────────────┐  ┌────────────────────────┐ │  │
│  │  │    DAO TREASURY        │  │   HEDGE FUND VAULT     │ │  │
│  │  │                        │  │                        │ │  │
│  │  │  ┌──────┐ ┌──────┐    │  │  ┌──────┐ ┌──────┐    │ │  │
│  │  │  │User D│ │User E│    │  │  │User G│ │User H│    │ │  │
│  │  │  │Admin │ │Member│    │  │  │Admin │ │Viewer│    │ │  │
│  │  │  │1000  │ │500   │    │  │  │5000  │ │(view)│    │ │  │
│  │  │  └──────┘ └──────┘    │  │  └──────┘ └──────┘    │ │  │
│  │  │       ▲                │  │                        │ │  │
│  │  │       │ can see        │  │                        │ │  │
│  │  │       ▼ each other     │  │                        │ │  │
│  │  │  ┌──────┐              │  │  ┌──────┐              │ │  │
│  │  │  │User F│              │  │  │User I│              │ │  │
│  │  │  │Member│              │  │  │Member│              │ │  │
│  │  │  │300   │              │  │  │2000  │              │ │  │
│  │  │  └──────┘              │  │  └──────┘              │ │  │
│  │  └────────────────────────┘  └────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│                    ┌─────────────────────┐                     │
│                    │  Anyone can transfer │                     │
│                    │  to anyone privately │                     │
│                    │  (solo ↔ solo)       │                     │
│                    │  (solo ↔ vault)      │                     │
│                    │  (vault ↔ vault)     │                     │
│                    └─────────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [How It Works](#1-how-it-works)
2. [Solo Users vs Vaults](#2-solo-users-vs-vaults)
3. [Technical Architecture](#3-technical-architecture)
4. [Account Structure](#4-account-structure)
5. [User Flows](#5-user-flows)
6. [ZK Layer (Noir)](#6-zk-layer-noir)
7. [Security](#7-security)
8. [Implementation](#8-implementation)

---

## 1. How It Works

### For Solo Users (Regular Privacy)

```
1. DEPOSIT (Shield)
   User sends tokens to pool contract on L1
   → Balance appears in PER (private)
   → Nobody else can see it

2. TRANSFER (Private)
   User sends to another address in the pool
   → Happens inside PER
   → No on-chain trace
   → Receiver could be solo user OR vault member

3. WITHDRAW (Unshield)
   User requests withdrawal
   → PER commits state to L1
   → Tokens sent to user's public wallet
```

### For Vault Users (Shared Privacy)

```
1. CREATE VAULT
   Admin creates vault with permission group
   → Vault is a container inside the pool
   → Admin can add members

2. DEPOSIT TO VAULT
   Member deposits to their vault balance
   → Other vault members can see the deposit
   → Outsiders (solo users, other vaults) can't

3. INTERNAL OPERATIONS
   Members can:
   → View all vault balances
   → Transfer between members (if permitted)
   → Withdraw own funds

4. EXTERNAL TRANSFERS
   Vault members can still:
   → Receive from anyone in the pool
   → Send to anyone in the pool
   → Privacy preserved for external parties
```

---

## 2. Solo Users vs Vaults

| Feature | Solo User | Vault Member |
|---------|-----------|--------------|
| **Who sees your balance** | Only you | You + vault members |
| **Transfer to others** | Private (nobody sees) | Private to outsiders, visible to vault |
| **Receive from others** | Private | Private to outsiders, visible to vault |
| **Withdraw** | Anytime | Anytime (own funds) |
| **Permission needed** | None | Added by vault admin |

### The Key Insight

A **solo user** is essentially a **vault with 1 member** where only they have permission to see their own balance.

```rust
// Conceptually:
SoloUser = Vault { members: [self], permissions: [Admin] }
```

This means the same codebase handles both — just different permission configurations.

---

## 3. Technical Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         SOLANA L1                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Pool Program │  │  Permission  │  │ ZK Verifier  │          │
│  │   (Anchor)   │  │   Program    │  │  (Anchor)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          │ delegation      │ permissions     │ proof verification
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PER (Private Execution)                     │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                    POOL STATE                           │  │
│   │                                                         │  │
│   │   Solo Accounts:        Vault Accounts:                 │  │
│   │   ┌─────────────┐       ┌─────────────────────────┐    │  │
│   │   │ addr → bal  │       │ vault_id → {           │    │  │
│   │   │ addr → bal  │       │   members: [addr...],  │    │  │
│   │   │ ...         │       │   balances: {addr:bal} │    │  │
│   │   └─────────────┘       │ }                      │    │  │
│   │                         └─────────────────────────┘    │  │
│   │                                                         │  │
│   │   Transaction Log (for ZK batching):                   │  │
│   │   [tx1, tx2, tx3, ...]                                 │  │
│   │                                                         │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │
          │ batch transactions
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NOIR PROVER                                │
│                                                                 │
│   Generates ZK proof that:                                      │
│   - All transfers are valid                                     │
│   - No double-spending                                          │
│   - Balances are conserved                                      │
│   - State transition is correct                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Privacy Model

| What | Who Can See |
|------|-------------|
| Pool total balance | Public (on L1) |
| Individual solo balances | Only the owner |
| Vault existence | Public (vault_id on L1) |
| Vault internal balances | Only vault members |
| Transfer: solo → solo | Nobody |
| Transfer: solo → vault | Vault members see incoming |
| Transfer: vault → solo | Vault members see outgoing |
| Transfer: vault → vault (same) | Vault members |
| Transfer: vault → vault (different) | Each vault sees their side |

---

## 4. Account Structure

### Pool State (in PER)

```rust
/// Global pool state
pub struct Pool {
    /// Total tokens in pool (public on L1 for verification)
    pub total_balance: u64,

    /// Merkle root of all balances (for ZK proofs)
    pub balance_root: [u8; 32],

    /// Nullifier set root (prevents double-spend)
    pub nullifier_root: [u8; 32],
}

/// Individual balance (solo user OR vault member)
pub struct Balance {
    /// Owner address
    pub owner: Pubkey,

    /// Token balance
    pub amount: u64,

    /// Optional: vault this balance belongs to (None = solo)
    pub vault_id: Option<[u8; 32]>,
}

/// Vault configuration
pub struct Vault {
    /// Unique identifier
    pub vault_id: [u8; 32],

    /// Admin who controls membership
    pub admin: Pubkey,

    /// Permission group ID (for PER access control)
    pub permission_group: [u8; 32],
}
```

### Permission Levels (within Vault)

```rust
pub enum VaultRole {
    /// Can view all vault balances
    Viewer,

    /// Can view + transfer + withdraw own funds
    Member,

    /// Can view + transfer + withdraw + manage members
    Admin,
}
```

---

## 5. User Flows

### 5.1 Solo User: Shield Funds

```
User A wants to become private:

1. A calls pool.deposit(100 SOL) on L1
2. Pool contract locks 100 SOL
3. Pool delegates to PER
4. PER creates Balance { owner: A, amount: 100, vault_id: None }
5. A can now transact privately
```

### 5.2 Solo User: Private Transfer

```
User A (solo) sends 50 SOL to User B (solo):

1. A authenticates to PER (signs challenge → session token)
2. A calls pool.transfer(B, 50) via PER endpoint
3. PER checks A has ≥50 balance
4. PER updates:
   - A.balance: 100 → 50
   - B.balance: 0 → 50 (or creates new balance)
5. Transaction logged for ZK batch
6. Nobody sees this except A and B (only their own balance)
```

### 5.3 Create Vault

```
User D wants to create a DAO treasury:

1. D calls pool.create_vault() on L1
2. Pool creates permission group via CPI
3. D becomes Admin of vault
4. D can now add members
```

### 5.4 Add Member to Vault

```
Admin D adds User E to vault:

1. D calls pool.add_vault_member(vault_id, E, Member)
2. Permission group updated on L1
3. E can now:
   - See all vault balances
   - Deposit to vault
   - Transfer within vault
   - Withdraw own funds
```

### 5.5 Deposit to Vault

```
User E deposits to DAO vault:

1. E calls pool.deposit_to_vault(vault_id, 500 SOL)
2. Pool locks 500 SOL
3. PER creates Balance { owner: E, amount: 500, vault_id: Some(vault_id) }
4. All vault members can now see E's 500 SOL balance
5. Outsiders see nothing
```

### 5.6 Cross-Type Transfer (Vault → Solo)

```
User E (in DAO vault) sends 100 SOL to User A (solo):

1. E authenticates to PER
2. E calls pool.transfer(A, 100)
3. PER checks E has ≥100 in vault
4. PER updates:
   - E.balance (in vault): 500 → 400
   - A.balance (solo): 50 → 150
5. Vault members see: "E sent 100 to external address"
6. A sees: "Received 100" (doesn't know it came from a vault)
7. Outside world sees: nothing
```

### 5.7 Settlement (ZK Batch)

```
Periodically, the operator settles:

1. Collect all PER transactions since last batch
2. Generate Noir proof of valid state transition
3. Submit proof to L1 verifier
4. Update L1 state roots
5. Batch is now cryptographically finalized
```

---

## 6. ZK Layer (Noir)

### What Gets Proved

```
┌─────────────────────────────────────────────────────────────┐
│                    NOIR CIRCUIT                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PUBLIC INPUTS:                                             │
│  ├── old_balance_root (from L1)                            │
│  ├── new_balance_root (being committed)                    │
│  ├── old_nullifier_root                                    │
│  ├── new_nullifier_root                                    │
│  └── batch_hash                                            │
│                                                             │
│  PRIVATE INPUTS (witness):                                  │
│  ├── transactions[]                                        │
│  ├── sender_balances_before[]                              │
│  ├── sender_balances_after[]                               │
│  ├── receiver_balances_before[]                            │
│  ├── receiver_balances_after[]                             │
│  └── merkle_proofs[]                                       │
│                                                             │
│  CONSTRAINTS:                                               │
│  ├── ∀tx: sender_before - amount = sender_after           │
│  ├── ∀tx: receiver_before + amount = receiver_after       │
│  ├── ∀tx: sender_after ≥ 0                                │
│  ├── ∀tx: nullifier is unique                             │
│  ├── old_root → new_root transition is valid              │
│  └── Σ(deposits) - Σ(withdrawals) = Δ(pool_balance)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Simplified Circuit

```noir
fn main(
    // Public
    old_balance_root: pub Field,
    new_balance_root: pub Field,
    nullifiers: pub [Field; BATCH_SIZE],

    // Private
    transfers: [Transfer; BATCH_SIZE],
) {
    for i in 0..BATCH_SIZE {
        let tx = transfers[i];

        // Balance conservation
        assert(tx.sender_before >= tx.amount);
        assert(tx.sender_before - tx.amount == tx.sender_after);
        assert(tx.receiver_before + tx.amount == tx.receiver_after);

        // Merkle inclusion
        assert(verify_inclusion(tx.sender, old_balance_root));
        assert(verify_inclusion(tx.receiver, old_balance_root));

        // Nullifier uniqueness
        assert(nullifiers[i] == hash(tx.sender, tx.nonce));
    }

    // State transition
    assert(compute_root(transfers) == new_balance_root);
}
```

---

## 7. Security

### Threat Model

| Threat | Solo User | Vault User | Mitigation |
|--------|-----------|------------|------------|
| **Balance leak** | Only if PER compromised | Vault members see it (by design) | TEE + ZK fallback |
| **Unauthorized transfer** | Can't happen (only owner) | Only permitted roles | Permission Program |
| **Double spend** | Nullifier prevents | Nullifier prevents | ZK proof |
| **Front-running** | Impossible (PER is private) | Impossible | No public mempool |
| **Admin abuse** | N/A | Admin can add/remove | Choose admin carefully |

### Defense in Depth

```
Layer 1: TEE (Intel TDX)
├── All pool state encrypted in hardware enclave
├── Even operator can't see individual balances
└── Attestation proves correct execution

Layer 2: Permissions (Solana L1)
├── Solo users: only self can access
├── Vault members: only group can access
└── Public verifiable permission changes

Layer 3: ZK Proofs (Noir)
├── Cryptographic proof of valid state transitions
├── No trust in operator required for settlement
└── Anyone can verify proofs on L1
```

---

## 8. Implementation

### MVP Scope (Hackathon)

1. **Pool contract** — deposit, withdraw, transfer
2. **Solo balances** — basic privacy for individuals
3. **Vault creation** — create group, add members
4. **Vault permissions** — Admin, Member, Viewer roles
5. **Basic Noir circuit** — batch proof of transfers
6. **Simple UI** — deposit, transfer, view balance

### Component Breakdown

| Component | Effort | Notes |
|-----------|--------|-------|
| Pool Program (Anchor) | 2 weeks | Core deposit/withdraw/transfer |
| PER Integration | 2 weeks | MagicBlock SDK |
| Permission System | 1 week | CPI to Permission Program |
| Vault Logic | 1 week | Group management |
| Noir Circuit | 3 weeks | Batch proofs |
| Verifier (Anchor) | 1 week | On-chain verification |
| Frontend | 2 weeks | Next.js + wallet |

### Architecture Decision

**Why PER + Noir (not pure ZK)?**

| Approach | Latency | Privacy | Complexity |
|----------|---------|---------|------------|
| Pure ZK (Railgun) | Slow (client proves) | Cryptographic | Very High |
| Pure TEE | Fast | Hardware-based | Medium |
| **PER + Noir (ours)** | Fast (TEE) + Verified (ZK) | Both | Medium-High |

We get:
- **Fast UX** from PER (instant transfers)
- **Cryptographic guarantees** from Noir (settlement proofs)
- **Flexible permissions** from Permission Program (vaults)

---

## Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    SHIELDED POOL                            │
│                                                             │
│   Solo Users          Vaults                                │
│   ───────────         ──────                                │
│   • Private           • Shared visibility inside            │
│   • Only self sees    • Members see each other              │
│   • No permissions    • Role-based access                   │
│                                                             │
│   Both can:                                                 │
│   • Deposit (shield)                                        │
│   • Transfer to anyone                                      │
│   • Withdraw (unshield)                                     │
│                                                             │
│   Privacy from outside world: ✓                             │
│   ZK settlement proofs: ✓                                   │
│   Fast execution (PER): ✓                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## References

- [MagicBlock PER Docs](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/authorization)
- [Noir Documentation](https://noir-lang.org/docs/)
- [Solana ZK Proof Example](https://github.com/wkennedy/solana-zk-proof-example)

---

*Document Version: 1.0*
*Architecture: Shielded Pool + Vaults*
*Status: Ready for Implementation*
