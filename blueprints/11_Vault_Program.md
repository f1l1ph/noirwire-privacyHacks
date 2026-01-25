# 11. Vault Program

**Status:** 🟢 Production Ready
**Version:** 2.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Account Structures](#3-account-structures)
4. [Permission System](#4-permission-system)
5. [Program Interface](#5-program-interface)
6. [User Flows](#6-user-flows)
7. [Security Model](#7-security-model)
8. [Design Decisions](#8-design-decisions)

---

## 1. Overview

### The Unified Model

> **"A solo user is just a vault of 1 member"**

This philosophy unifies private (solo) and shared (vault) balances under a single architecture:

- **Solo user:** `vault_id = None` → only owner sees balance
- **Vault member:** `vault_id = Some(vault_id)` → all members see balance

### Key Responsibilities

The vault program handles:

- ✅ **Vault creation** — creates vault + permission group via CPI
- ✅ **Member management** — add/remove members through PER Permission Program
- ✅ **Balance tagging** — creates Balance with `vault_id` field
- ✅ **Permission integration** — delegates access control to PER

### What This Does NOT Do

- ❌ **No membership merkle trees** — PER Permission Program manages membership
- ❌ **No on-chain membership proofs** — handled in PER TEE environment
- ❌ **No multi-sig threshold logic** — enforced by PER, not on-chain
- ❌ **No member list storage** — stored in PER permission group

---

## 2. Architecture

### System Diagram

```
┌────────────────────────────────────────────────────────┐
│                 VAULT ARCHITECTURE                     │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Solo User (Alice)                                     │
│  ┌──────────────────────────────────────┐             │
│  │ Balance {                            │             │
│  │   owner: Alice,                      │             │
│  │   amount: 100,                       │             │
│  │   vault_id: None  ← Solo            │             │
│  │ }                                    │             │
│  └──────────────────────────────────────┘             │
│       ↓                                                │
│  Only Alice sees this balance                          │
│                                                        │
│  ════════════════════════════════════════════════════  │
│                                                        │
│  Vault (DAO Treasury)                                  │
│  ┌──────────────────────────────────────┐             │
│  │ Vault {                              │             │
│  │   vault_id: 0xabc...,                │             │
│  │   admin: Bob,                        │             │
│  │   permission_group: 0x123...  ─────┐ │             │
│  │ }                                  │ │             │
│  └────────────────────────────────────┼─┘             │
│                                       │               │
│                                       ▼               │
│                        PER Permission Program         │
│                        ├─ Bob: Admin                  │
│                        ├─ Carol: Member               │
│                        └─ Dave: Viewer                │
│                                                        │
│  ┌──────────────────────────────────────┐             │
│  │ Balance {                            │             │
│  │   owner: Carol,                      │             │
│  │   amount: 500,                       │             │
│  │   vault_id: Some(0xabc...)  ← Vault │             │
│  │ }                                    │             │
│  └──────────────────────────────────────┘             │
│       ↓                                                │
│  Bob, Carol, Dave all see this balance                 │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Component Integration

```
Vault Program (L1)          PER Permission Program
      ↓                              ↓
create_vault()  ──────CPI──────→  create_group()
add_member()    ──────CPI──────→  add_to_group()
remove_member() ──────CPI──────→  remove_from_group()
                                      ↓
                            PER TEE checks permissions
                            before executing transfers
```

---

## 3. Account Structures

### Vault Account

On-chain vault state (Solana L1):

```rust
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Unique vault identifier
    pub vault_id: [u8; 32],

    /// Human-readable name (max 32 chars)
    #[max_len(32)]
    pub name: String,

    /// Admin who controls membership
    pub admin: Pubkey,

    /// PER Permission Group ID
    /// This is where membership is actually stored
    pub permission_group: [u8; 32],

    /// Unix timestamp
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}
```

**Size:** ~250 bytes (8 + 32 + 4 + 32 + 32 + 32 + 8 + 1)

**PDA Seeds:** `["vault", vault_id]`

**Design rationale:**
- No `members_root` — membership managed by PER Permission Program
- No `member_count` — stored in permission group
- No `threshold` — multi-sig logic handled by PER
- Simple `permission_group` reference delegates all access control

---

### Balance Structure (PER State)

Stored in PER TEE environment (not on-chain):

```rust
pub struct Balance {
    /// Owner address
    pub owner: Pubkey,

    /// Token balance
    pub amount: u64,

    /// Vault context
    pub vault_id: Option<[u8; 32]>,
}
```

**Privacy model:**

| vault_id | Visibility |
|----------|-----------|
| `None` | Only `owner` can see (solo user) |
| `Some(vault_id)` | All members of `vault_id` can see |

**Examples:**

```rust
// Solo user Alice
Balance {
    owner: alice_pubkey,
    amount: 100_000_000,  // 0.1 SOL
    vault_id: None,       // Private to Alice only
}

// Vault member Bob
Balance {
    owner: bob_pubkey,
    amount: 500_000_000,  // 0.5 SOL
    vault_id: Some(dao_vault_id),  // Visible to all DAO members
}
```

---

## 4. Permission System

### Roles

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum VaultRole {
    /// Can view all vault balances
    Viewer,

    /// Can view + transfer + withdraw own funds
    Member,

    /// Can view + transfer + withdraw + manage members
    Admin,
}
```

**Permission matrix:**

| Action | Viewer | Member | Admin |
|--------|--------|--------|-------|
| View vault balances | ✅ | ✅ | ✅ |
| Deposit to vault | ❌ | ✅ | ✅ |
| Transfer (within vault) | ❌ | ✅ | ✅ |
| Withdraw own funds | ❌ | ✅ | ✅ |
| Add members | ❌ | ❌ | ✅ |
| Remove members | ❌ | ❌ | ✅ |

### Permission Flow

PER Permission Program enforces access control:

```
User → PER TEE → Check Permission Program → Execute if authorized

Example: Alice tries to view DAO vault balances

1. Alice authenticates to PER TEE
2. PER calls Permission Program: check_access(dao_vault_id, alice, Viewer)
3. Permission Program returns: alice has Member role ✅
4. PER returns vault balances to Alice
```

**Key insight:** Permissions checked in PER, not on-chain. This enables private execution while maintaining access control.

---

## 5. Program Interface

### create_vault

Creates a new vault with permission group.

```rust
pub fn create_vault(
    ctx: Context<CreateVault>,
    vault_id: [u8; 32],
    name: String,
) -> Result<()>
```

**Accounts:**
- `vault` (init, PDA: `["vault", vault_id]`)
- `admin` (signer, payer)
- `per_permission_program` (PER Permission Program)
- `system_program`

**Flow:**
1. Validate name length ≤ 32 chars
2. Create Vault PDA
3. CPI to PER Permission Program → create permission group
4. Store `permission_group` ID in vault
5. Emit `VaultCreatedEvent`

**Result:** Vault created with admin as initial member.

---

### add_vault_member

Adds a member to the vault (admin only).

```rust
pub fn add_vault_member(
    ctx: Context<ManageVault>,
    vault_id: [u8; 32],
    member: Pubkey,
    role: VaultRole,
) -> Result<()>
```

**Accounts:**
- `vault` (constraint: `has_one = admin`)
- `admin` (signer)
- `per_permission_program`

**Flow:**
1. Verify caller is vault admin
2. CPI to PER Permission Program → add member to group
3. Emit `MemberAddedEvent`

**Constraint:** Only admin can add members.

---

### remove_vault_member

Removes a member from the vault (admin only).

```rust
pub fn remove_vault_member(
    ctx: Context<ManageVault>,
    vault_id: [u8; 32],
    member: Pubkey,
) -> Result<()>
```

**Accounts:**
- `vault` (constraint: `has_one = admin`)
- `admin` (signer)
- `per_permission_program`

**Flow:**
1. Verify caller is vault admin
2. CPI to PER Permission Program → remove member from group
3. Emit `MemberRemovedEvent`

**Constraint:** Only admin can remove members.

---

### deposit_to_vault

Tags a balance with vault_id (member only).

```rust
pub fn deposit_to_vault(
    ctx: Context<DepositToVault>,
    vault_id: [u8; 32],
    amount: u64,
) -> Result<()>
```

**Accounts:**
- `vault`
- `user` (signer)
- `per_permission_program`
- `pool_program` (for CPI)

**Flow:**
1. Check user has at least Member role via CPI
2. CPI to pool program → create Balance with `vault_id` tag
3. Emit `DepositToVaultEvent`

**Note:** User must first shield tokens via pool program deposit.

---

## 6. User Flows

### Create Vault

**Scenario:** Alice wants to create a DAO treasury.

**Steps:**

1. Alice calls `vault.create_vault(vault_id, "DAO Treasury")`
2. Vault PDA created on L1
3. Permission group created via CPI to PER Permission Program
4. Alice becomes Admin of vault

**On-chain state:**

```rust
Vault {
    vault_id: 0xabc123...,
    name: "DAO Treasury",
    admin: alice_pubkey,
    permission_group: 0x456def...,
    created_at: 1706140800,
}
```

---

### Add Member

**Scenario:** Alice (admin) adds Bob to DAO treasury as Member.

**Steps:**

1. Alice calls `vault.add_vault_member(vault_id, bob_pubkey, Member)`
2. Vault program verifies Alice is admin
3. CPI to PER Permission Program updates group
4. Bob can now access vault

**Bob's permissions:**
- ✅ View all vault balances
- ✅ Deposit to vault
- ✅ Transfer within vault
- ✅ Withdraw own funds
- ❌ Add/remove members (not admin)

---

### Deposit to Vault

**Scenario:** Bob deposits 500 SOL to DAO vault.

**Steps:**

1. Bob shields 500 SOL via `pool.deposit(amount, commitment, proof)`
   - Creates private Balance with `vault_id: None` (solo)

2. Bob calls `vault.deposit_to_vault(vault_id, 500_000_000)`
   - Checks Bob has Member role
   - Updates Balance: `vault_id: None` → `vault_id: Some(vault_id)`

**Result:** Bob's 500 SOL now visible to all DAO members.

**PER state:**

```rust
Balance {
    owner: bob_pubkey,
    amount: 500_000_000,
    vault_id: Some(0xabc123...),  // ← Tagged as vault balance
}
```

---

### Cross-Type Transfer

**Scenario:** Bob (vault member) sends 100 SOL to Carol (solo user).

**Steps:**

1. Bob authenticates to PER TEE
2. Bob calls `transfer(carol_pubkey, 100_000_000)`
3. PER checks Bob's permission for vault
4. PER executes transfer:
   - Bob's balance: 500 → 400 SOL (vault)
   - Carol's balance: 50 → 150 SOL (solo)

**Privacy:**
- ✅ DAO members see: "Bob sent 100 SOL to external address"
- ✅ Carol sees: "Received 100 SOL"
- ❌ Carol does NOT know it came from a vault
- ❌ Outsiders see: nothing

---

### Vault-to-Vault Transfer

**Scenario:** Bob (DAO vault) sends 50 SOL to Dave (Company vault).

**Steps:**

1. Bob authenticates to PER TEE
2. Bob calls `transfer(dave_pubkey, 50_000_000)`
3. PER checks:
   - Bob has permission in DAO vault ✅
   - Dave has permission in Company vault ✅
4. PER executes transfer:
   - Bob's balance: 400 → 350 SOL (DAO vault)
   - Dave's balance: 200 → 250 SOL (Company vault)

**Privacy:**
- ✅ DAO members see: "Bob sent 50 SOL to external address"
- ✅ Company members see: "Dave received 50 SOL"
- ❌ DAO members do NOT see Company vault details
- ❌ Company members do NOT see DAO vault details
- ❌ Outsiders see: nothing

---

## 7. Security Model

### Defense in Depth

```
Layer 1: TEE (Intel TDX)
├── All balance data encrypted in hardware enclave
├── Operator cannot see individual balances
└── Attestation proves correct execution

Layer 2: Permissions (Solana L1)
├── Solo users: only self can access (vault_id: None)
├── Vault members: only group can access (via Permission Program)
└── Public verifiable permission changes on-chain

Layer 3: ZK Proofs (Noir)
├── Cryptographic proof of valid state transitions
├── No trust in operator required for settlement
└── Anyone can verify proofs on L1
```

### Threat Model

| Threat | Solo User | Vault User | Mitigation |
|--------|-----------|-----------|------------|
| **Balance leak** | Only if PER compromised | Vault members see (by design) | TEE + ZK fallback |
| **Unauthorized transfer** | Impossible (only owner) | Only permitted roles | Permission Program |
| **Double spend** | Nullifier prevents | Nullifier prevents | ZK proof |
| **Front-running** | Impossible (private) | Impossible | No public mempool |
| **Admin abuse** | N/A | Admin can add/remove | Choose admin carefully |
| **PER operator attack** | TEE prevents | TEE prevents | Hardware attestation |

### Security Properties

1. **Solo Privacy:** Solo users (`vault_id: None`) completely private
2. **Vault Transparency:** Vault members see each other's balances (by design)
3. **External Privacy:** Outsiders cannot see any vault operations
4. **Balance Conservation:** ZK proves no tokens created/destroyed
5. **No Double-Spend:** Nullifiers prevent spending same commitment twice
6. **Permission Enforcement:** PER checks permissions before execution
7. **Auditability:** On-chain permission changes publicly verifiable

---

## 8. Design Decisions

### Why No On-Chain Membership Tree?

**Alternatives considered:**

1. **Merkle tree of members** (original design)
   - Requires ZK membership proofs
   - Complex circuit logic
   - On-chain storage costs

2. **On-chain member array**
   - Simple but not private
   - High account size for large vaults

3. **PER Permission Program** (chosen)
   - Leverages existing PER infrastructure
   - No ZK membership circuits needed
   - Private membership checks in TEE

**Choice:** Delegate to PER Permission Program for simplicity.

**Tradeoff:** Requires trust in PER Permission Program implementation.

---

### Why vault_id Tagging?

**Alternative:** Separate balance accounts per vault.

**Problem:** Complex account management, difficult to transfer between contexts.

**Solution:** Single Balance structure with optional `vault_id` field.

**Advantages:**
- Unified solo/vault model
- Easy cross-type transfers
- Simple PER state management

**Implementation:**

```rust
// Solo user → Vault member
balance.vault_id = None;        // Solo
balance.vault_id = Some(vault); // Vault member

// Query all vault balances
balances.iter()
    .filter(|b| b.vault_id == Some(vault_id))
```

---

### Why Roles Instead of Thresholds?

**Alternatives:**

1. **Threshold signatures** (e.g., 3-of-5 multi-sig)
   - Complex on-chain logic
   - Requires ZK threshold circuits

2. **Role-based access** (chosen)
   - Simple permission model
   - Easy to understand and audit
   - Extensible (can add more roles)

**Choice:** Role-based permissions managed by PER.

**For multi-sig:** Use PER Permission Program's threshold features, not on-chain circuits.

---

### Why Solo = Vault of 1?

**Philosophy:** Treating solo users as a special case creates complexity.

**Unified model:**

```rust
// Solo user (implicit vault of 1)
Balance {
    vault_id: None,  // Special case: only owner sees
}

// Vault member
Balance {
    vault_id: Some(vault_id),  // All members see
}
```

**Advantages:**
- Single code path for balance management
- Easy mental model
- Smooth transition from solo → vault member

**Implementation simplicity:** Solo is just vault with `vault_id = None`.

---

## Integration Checklist

Before production deployment:

- [ ] Deploy vault program to devnet
- [ ] Integrate with PER Permission Program (confirm CPI interface)
- [ ] Update pool program to support `vault_id` tagging
- [ ] Test vault creation flow
- [ ] Test member add/remove flow
- [ ] Test deposit to vault
- [ ] Test vault-to-vault transfers
- [ ] Test vault-to-solo transfers
- [ ] Verify permissions enforced in PER
- [ ] Test emergency scenarios (admin removal, etc.)
- [ ] Security audit of vault program
- [ ] Document PER Permission Program integration

---

## Error Codes

```rust
#[error_code]
pub enum VaultError {
    #[msg("Vault name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Not authorized to access this vault")]
    NotAuthorized,

    #[msg("Cannot remove last admin from vault")]
    CannotRemoveLastAdmin,

    #[msg("Vault does not exist")]
    VaultNotFound,

    #[msg("Member already exists in vault")]
    MemberAlreadyExists,

    #[msg("Member not found in vault")]
    MemberNotFound,
}
```

---

## Events

```rust
#[event]
pub struct VaultCreatedEvent {
    pub vault_id: [u8; 32],
    pub admin: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct MemberAddedEvent {
    pub vault_id: [u8; 32],
    pub member: Pubkey,
    pub role: VaultRole,
    pub added_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MemberRemovedEvent {
    pub vault_id: [u8; 32],
    pub member: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct DepositToVaultEvent {
    pub vault_id: [u8; 32],
    pub depositor: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
```

---

## Account Size Summary

| Account | Size | Rent (lamports) | Refundable? |
|---------|------|-----------------|-------------|
| Vault | ~250 bytes | ~20,000 | Yes (admin) |

**Note:** Balance accounts stored in PER (not on-chain), zero rent cost.

---

## References

### Related Blueprints
- **01_Zk_Noir_Circuits.md** — ZK circuits for private transfers
- **10_Solana_Programs.md** — Shielded pool program integration
- **03_Vault_Circuits.md** — Simplified vault circuits (no membership proofs)

### PER Documentation
- [MagicBlock PER Authorization](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/authorization)
- [Permission Program Guide](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/permissions)

### Implementation Files
- `programs/vault/src/lib.rs` — Vault program
- `programs/shielded-pool/src/lib.rs` — Pool program with vault integration

---

## Summary

This blueprint defines the **vault system** for Noirwire:

✅ **Unified Model:** Solo = vault of 1 (via `vault_id: None`)
✅ **Simple Structure:** `{ vault_id, admin, permission_group }`
✅ **Role-Based Permissions:** Viewer, Member, Admin
✅ **PER Integration:** Delegates access control to Permission Program
✅ **No On-Chain Complexity:** No merkle trees, no threshold circuits
✅ **Privacy Preserved:** TEE + ZK proofs for settlement

**Design Principles:**

1. **Simplicity over features** — no complex on-chain membership logic
2. **Leverage PER infrastructure** — use Permission Program instead of custom ZK
3. **Unified balance model** — solo and vault users share same structure
4. **Privacy by default** — all operations private in TEE, verified by ZK

**Next Steps:**

1. Implement vault program following this spec
2. Integrate with PER Permission Program
3. Update pool program for `vault_id` tagging
4. Test full vault lifecycle end-to-end
5. Security audit before mainnet

---

**Blueprint Version:** 2.0
**Status:** Production Ready
**Estimated Reading Time:** 10 minutes
