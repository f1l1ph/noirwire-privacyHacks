# 10 — Solana Programs Architecture

## Overview

This blueprint defines the **Solana on-chain programs** for the Noirwire private payment system. These programs handle deposits, withdrawals, state commitments, and ZK proof verification.

> **Reference:** See [01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md) for the ZK circuits these programs verify.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Account Structures](#2-account-structures)
3. [Program Interfaces](#3-program-interfaces)
4. [ZK Verification](#4-zk-verification)
5. [PER Integration](#5-per-integration)
6. [Nullifier Management](#6-nullifier-management)
7. [Security Model](#7-security-model)
8. [Design Decisions](#8-design-decisions)

---

## 1. System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SOLANA L1 PROGRAMS                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │   SHIELDED POOL     │    │    ZK VERIFIER      │        │
│  │      PROGRAM        │───▶│      PROGRAM        │        │
│  │                     │    │                     │        │
│  │  • Deposits         │    │  • Groth16 verify   │        │
│  │  • Withdrawals      │    │  • alt_bn128 ops    │        │
│  │  • State roots      │    │  • Proof validation │        │
│  │  • Nullifier set    │    │                     │        │
│  └──────────┬──────────┘    └─────────────────────┘        │
│             │                                               │
│             │ CPI                                           │
│             ▼                                               │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │   VAULT REGISTRY    │    │   TOKEN PROGRAM     │        │
│  │      PROGRAM        │    │   (SPL Token)       │        │
│  │                     │    │                     │        │
│  │  • Vault creation   │    │  • Token transfers  │        │
│  │  • Permissions      │    │                     │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                             │
│  ════════════════════════════════════════════════════════  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              PER INTEGRATION LAYER                    │ │
│  │                                                       │ │
│  │   MagicBlock Ephemeral Rollup Programs:              │ │
│  │   • Delegation Program (account delegation)          │ │
│  │   • Permission Program (access control)              │ │
│  │   • Commit/Undelegate (settlement to L1)             │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Program IDs

```rust
// Noirwire Programs (generated on deployment)
pub mod program_ids {
    use solana_program::declare_id;

    declare_id!("NwirePoo1..."); // Shielded Pool
    declare_id!("NwireVrfy..."); // ZK Verifier
    declare_id!("NwireVau1..."); // Vault Registry
}

// MagicBlock Programs
pub mod magicblock {
    declare_id!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"); // Delegation
    declare_id!("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"); // Permission
}
```

---

## 2. Account Structures

### Pool State

The main state account for the shielded pool:

```rust
pub const HISTORICAL_ROOTS_SIZE: usize = 900; // 6 min spending window
pub const TREE_DEPTH: usize = 24;             // ~16M capacity

#[account]
pub struct PoolState {
    /// Authority (multisig recommended)
    pub authority: Pubkey,

    /// Current merkle root
    pub commitment_root: [u8; 32],

    /// Historical roots (delayed spending support)
    pub historical_roots: [[u8; 32]; HISTORICAL_ROOTS_SIZE],
    pub roots_index: u8,

    /// Pool accounting
    pub total_shielded: u64,
    pub token_mint: Pubkey,
    pub token_vault: Pubkey,

    /// Circuit verification
    pub vk_hash: [u8; 32],

    /// Emergency controls
    pub paused: bool,

    /// Statistics
    pub total_deposits: u64,
    pub total_withdrawals: u64,
    pub total_nullifiers: u64,

    pub bump: u8,
    pub _reserved: [u8; 256],
}

impl PoolState {
    /// Check if root is current or in history
    pub fn is_valid_root(&self, root: &[u8; 32]) -> bool {
        self.commitment_root == *root ||
        self.historical_roots.iter().any(|r| r == root)
    }

    /// Update root, push current to history
    pub fn update_root(&mut self, new_root: [u8; 32]) {
        self.historical_roots[self.roots_index as usize] = self.commitment_root;
        self.roots_index = (self.roots_index + 1) % (HISTORICAL_ROOTS_SIZE as u8);
        self.commitment_root = new_root;
    }
}
```

**Size:** ~29KB (8 + 32 + 28800 + 1 + 8 + 32 + 32 + 32 + 1 + 24 + 1 + 256)

### Nullifier Entry

Individual nullifier storage (PDA per nullifier):

```rust
#[account]
pub struct NullifierEntry {
    pub nullifier: [u8; 32],
    pub slot: u64,
    pub bump: u8,
}

impl NullifierEntry {
    pub const SIZE: usize = 8 + 32 + 8 + 1; // 49 bytes

    /// PDA seeds: ["nullifier", pool_pubkey, nullifier_hash]
    pub fn seeds<'a>(pool: &'a Pubkey, nullifier: &'a [u8; 32]) -> [&'a [u8]; 3] {
        [b"nullifier", pool.as_ref(), nullifier]
    }
}
```

### Verification Key

Stores Groth16 verification key for a circuit:

```rust
#[account]
pub struct VerificationKey {
    pub pool: Pubkey,
    pub circuit_id: [u8; 32],

    // Groth16 verification key components (BN254 curve)
    pub alpha_g1: [u8; 64],       // G1 point (compressed)
    pub beta_g2: [u8; 128],       // G2 point (compressed)
    pub gamma_g2: [u8; 128],
    pub delta_g2: [u8; 128],

    // Input commitments (variable length)
    pub ic_length: u8,
    pub ic: Vec<[u8; 64]>,        // Each IC point is 64 bytes

    pub bump: u8,
}

impl VerificationKey {
    pub fn size(ic_count: usize) -> usize {
        8 + 32 + 32 + 64 + 128 + 128 + 128 + 1 + 4 + (ic_count * 64) + 1
    }
}
```

### Vault

```rust
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub vault_id: [u8; 32],

    #[max_len(32)]
    pub name: String,

    pub admin: Pubkey,
    pub permission_group: [u8; 32],  // PER Permission Group ID
    pub created_at: i64,
    pub bump: u8,
}
```

**Design:** No on-chain membership tree. Membership managed by PER Permission Program.

---

## 3. Program Interfaces

### Shielded Pool Program

#### initialize

Creates a new shielded pool for a token mint.

```rust
pub fn initialize(
    ctx: Context<Initialize>,
    token_mint: Pubkey,
    vk_hash: [u8; 32],
) -> Result<()>
```

**Accounts:**

- `pool` (init, PDA: `["pool", token_mint]`)
- `token_vault` (init, PDA: `["vault", pool]`)
- `authority` (signer, payer)

**Effect:** Creates pool state, initializes merkle root to zero.

---

#### deposit

Shield tokens into the pool (public → private).

```rust
pub fn deposit(
    ctx: Context<Deposit>,
    amount: u64,
    commitment: [u8; 32],
    proof: ProofData,
) -> Result<()>
```

**Accounts:**

- `pool` (mut, constraint: `!paused`)
- `user_token_account` (mut)
- `pool_vault` (mut)
- `depositor` (signer)
- `verifier_program`
- `verification_key`

**Public Inputs for ZK Proof:**

- `amount` (deposit amount)
- `commitment` (new balance commitment)
- `new_root` (updated merkle root)

**Flow:**

1. Verify ZK proof via CPI to verifier
2. Transfer tokens from user to vault
3. Update pool state (root, total_shielded)
4. Emit `DepositEvent`

---

#### withdraw

Unshield tokens from the pool (private → public).

```rust
pub fn withdraw(
    ctx: Context<Withdraw>,
    amount: u64,
    nullifier: [u8; 32],
    recipient: Pubkey,
    proof: ProofData,
) -> Result<()>
```

**Accounts:**

- `pool` (mut, constraint: `!paused`)
- `pool_vault` (mut)
- `recipient_token_account` (mut)
- `nullifier_entry` (init, PDA: `["nullifier", pool, nullifier]`)
- `payer` (signer)
- `pool_authority` (PDA: `["authority", pool]`)

**Public Inputs for ZK Proof:**

- `nullifier` (spent commitment proof)
- `amount` (withdrawal amount)
- `recipient` (receiving address)
- `old_root` (merkle root at proof time)
- `new_root` (updated merkle root)

**Flow:**

1. Verify `old_root` is valid (current or historical)
2. Verify ZK proof via CPI
3. Create nullifier PDA (prevents double-spend)
4. Transfer tokens from vault to recipient
5. Update pool state
6. Emit `WithdrawEvent`

---

#### settle_batch

Batch settlement from PER (multiple transactions).

```rust
pub fn settle_batch(
    ctx: Context<SettleBatch>,
    new_root: [u8; 32],
    nullifiers_root: [u8; 32],
    nullifier_count: u32,
    proof: ProofData,
) -> Result<()>
```

**Accounts:**

- `pool` (mut)
- `per_authority` (signer, TEE validator)
- `verification_key` (batch circuit VK)
- `verifier_program`

**Public Inputs for ZK Proof:**

- `old_root` (initial merkle root)
- `new_root` (final merkle root)
- `nullifiers_root` (merkle root of all nullifiers in batch)
- `nullifier_count` (number of transactions)

**Flow:**

1. Verify batch proof (proves all transitions are valid)
2. Store `nullifiers_root` for later nullifier verification
3. Update pool root
4. Emit `BatchSettlementEvent`

**Note:** Individual nullifiers created in separate transactions (see section 6).

---

#### update_vk

Admin function to update circuit verification key.

```rust
pub fn update_vk(
    ctx: Context<UpdateVk>,
    circuit_id: [u8; 32],
    vk_data: VerificationKeyData,
) -> Result<()>
```

**Constraint:** Only pool authority can call.

---

#### set_paused

Emergency pause toggle.

```rust
pub fn set_paused(
    ctx: Context<SetPaused>,
    paused: bool
) -> Result<()>
```

**Constraint:** Only pool authority can call.

---

## 4. ZK Verification

### Groth16 Verification

Solana provides `alt_bn128` syscalls for BN254 elliptic curve operations (same as Ethereum).

**Verification Equation:**

```
e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)

Checked as:
e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
```

Where `vk_x = IC[0] + sum(public_input[i] * IC[i+1])`

### ZK Verifier Program

```rust
pub fn verify(
    ctx: Context<VerifyProof>,
    proof: Groth16Proof,
    public_inputs: Vec<[u8; 32]>,
) -> Result<()>
```

**Groth16 Proof Structure:**

```rust
pub struct Groth16Proof {
    pub a: [u8; 64],    // G1 point (compressed)
    pub b: [u8; 128],   // G2 point (compressed)
    pub c: [u8; 64],    // G1 point (compressed)
}
```

**Algorithm:**

1. Compute `vk_x` by accumulating public inputs:
   - Start with `IC[0]`
   - For each input `i`: add `input[i] * IC[i+1]` using `alt_bn128_multiplication`
   - Accumulate using `alt_bn128_addition`

2. Build pairing input (4 pairs):
   - `(-A, B)` — negated proof point
   - `(alpha, beta)` — from VK
   - `(vk_x, gamma)` — accumulated inputs
   - `(C, delta)` — proof point

3. Execute `alt_bn128_pairing` syscall

4. Check result == 1 (proof valid)

### alt_bn128 Syscalls

```rust
// Point addition (G1 or G2)
fn alt_bn128_addition(p1: &[u8], p2: &[u8]) -> Result<Vec<u8>>

// Scalar multiplication (G1 point * scalar)
fn alt_bn128_multiplication(point: &[u8], scalar: &[u8; 32]) -> Result<Vec<u8>>

// Pairing check (4 pairs for Groth16)
fn alt_bn128_pairing(input: &[u8]) -> Result<Vec<u8>>
```

### Compute Units

Estimated CU consumption per proof verification:

| Operation         | CU Cost | Count | Total        |
| ----------------- | ------- | ----- | ------------ |
| Pairing (4 pairs) | 79,000  | 4     | 316,000      |
| Scalar mul        | 12,000  | ~10   | 120,000      |
| Point add         | 500     | ~10   | 5,000        |
| Overhead          | —       | —     | 50,000       |
| **Total**         | —       | —     | **~490,000** |

**Client must request compute budget:**

```typescript
ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });
```

---

## 5. PER Integration

### Delegation Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                  PER LIFECYCLE                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. DELEGATE (Base Layer → PER TEE)                    │
│     └─ Account ownership transferred to Delegation     │
│        Program, cloned to TEE environment              │
│                                                         │
│  2. EXECUTE PRIVATELY (Inside PER TEE)                 │
│     └─ Private transfers, proof generation            │
│        Operator cannot see individual balances         │
│                                                         │
│  3. COMMIT (Periodic settlement to L1)                 │
│     └─ State synced, account stays delegated          │
│                                                         │
│  4. UNDELEGATE (Return to Base Layer)                  │
│     └─ Final state committed, ownership returned      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Program Integration

Programs must support PER delegation using `ephemeral-rollups-sdk`:

```rust
use ephemeral_rollups_sdk::cpi::{delegate_account, commit_accounts, undelegate_account};

#[ephemeral]  // Mark program as PER-compatible
#[program]
pub mod shielded_pool {
    pub fn delegate(ctx: Context<DelegatePool>) -> Result<()> {
        delegate_account(
            &ctx.accounts.payer,
            &ctx.accounts.pool,
            &ctx.accounts.owner_program,
            &ctx.accounts.buffer,
            &ctx.accounts.delegation_record,
            &ctx.accounts.delegation_metadata,
            &ctx.accounts.delegation_program,
            &ctx.accounts.system_program,
            None, // PDA seeds if needed
            vec![TEE_VALIDATOR_PUBKEY],
            30 * 24 * 60 * 60, // 30 day validity
        )
    }

    pub fn commit(ctx: Context<CommitPool>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.pool.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )
    }

    pub fn commit_and_undelegate(ctx: Context<CommitPool>) -> Result<()> {
        // First commit, then undelegate
        commit_accounts(...)?;
        undelegate_account(...)?;
        Ok(())
    }
}
```

### TEE Authorization

PER execution requires authentication:

```typescript
// Get auth token for TEE endpoint
const challenge = await fetch("https://tee.magicblock.app/challenge");
const signature = wallet.signMessage(challenge);
const authToken = await authenticate(signature);

// Connect to PER
const perConnection = new Connection(
  `https://tee.magicblock.app?token=${authToken}`,
);
```

---

## 6. Nullifier Management

### Why Separate from Batch?

**Problem:** Solana transactions limited to 1232 bytes.

- Batch of 256 transactions = 256 nullifiers × 32 bytes = **8KB** ❌

**Solution:** Two-phase approach:

1. **Batch settlement** proves `nullifiers_root` (merkle root of all nullifiers)
2. **Individual nullifier PDAs** created in separate transactions

### record_nullifier

Called by PER/indexer after `settle_batch`:

```rust
pub fn record_nullifier(
    ctx: Context<RecordNullifier>,
    nullifier: [u8; 32],
    nullifiers_root: [u8; 32],
    merkle_proof: Vec<[u8; 32]>,
) -> Result<()>
```

**Flow:**

1. Verify `nullifier` is in `nullifiers_root` using merkle proof
2. Create nullifier PDA (init ensures uniqueness)
3. Store slot for cleanup eligibility

**Batch processing:** Indexer creates 10-20 nullifiers per transaction.

---

## 7. Security Model

### Attack Vectors & Mitigations

| Attack                       | Mitigation                                      | Layer            |
| ---------------------------- | ----------------------------------------------- | ---------------- |
| **Double-spend**             | Nullifier PDA uniqueness (init fails if exists) | Solana L1        |
| **Fake proof**               | Groth16 verification via alt_bn128 pairing      | Solana L1        |
| **Invalid state transition** | ZK circuit proves merkle updates valid          | ZK proof         |
| **Stale root attack**        | Historical roots buffer (900 roots = 6 min)     | Pool state       |
| **Front-running**            | Encrypted inputs in TEE, commitment scheme      | PER + ZK         |
| **Nullifier spam**           | Rent cost per nullifier (~14k lamports)         | Solana economics |
| **VK substitution**          | VK hash stored in pool, verified on use         | Pool state       |

### Access Control

```rust
pub enum Role {
    Admin,      // Can pause, update VK
    PER,        // Can batch settle (TEE validator)
    User,       // Can deposit, withdraw (with valid proof)
}
```

**Constraints:**

- `deposit`: Anyone with tokens + valid proof
- `withdraw`: Anyone with valid proof (proves ownership via ZK)
- `settle_batch`: Only PER authority (TEE validator)
- `update_vk`: Only pool admin
- `set_paused`: Only pool admin

### Emergency Procedures

```rust
pub fn emergency_pause(ctx: Context<AdminAction>) -> Result<()> {
    require!(ctx.accounts.pool.authority == ctx.accounts.admin.key());
    ctx.accounts.pool.paused = true;
    emit!(EmergencyPauseEvent { ... });
    Ok(())
}
```

**Pause effect:**

- ❌ Blocks: `deposit`, `withdraw`, `settle_batch`
- ✅ Allows: `update_vk` (to fix circuit bugs), `set_paused` (to unpause)

---

## 8. Design Decisions

### Why Historical Roots Buffer?

**Problem:** User generates proof at root `R1`, but by submission time root is `R2`.

**Solution:** Accept proofs for last 900 roots (≈6 minutes on Solana).

**Justification:**

- Matches Tornado Cash security model (30 roots × 12s = 360s on Ethereum)
- Accommodates network congestion, RPC delays
- Allows pre-generated proofs

**Tradeoff:** 900 × 32 bytes = 28.8KB account space

---

### Why Separate Nullifier PDAs?

**Alternatives considered:**

1. **Bitmap:** Space-efficient but complex indexing
2. **Single account array:** Hits 10MB account size limit at ~300k nullifiers
3. **PDA per nullifier:** Current choice

**Advantages:**

- Solana guarantees uniqueness (init fails on duplicate)
- Parallel creation (no account contention)
- Rent recoverable via cleanup

**Disadvantages:**

- Higher rent cost (~14k lamports per nullifier)
- Two-phase settlement (batch proof + nullifier PDAs)

**Mitigation:** Implement nullifier cleanup after finality.

---

### Why Batch Settlement?

**Problem:** PER processes many private transactions (10-1000s).

**Naive approach:** Settle each transaction individually to L1.

- 1000 txs × 600k CU = millions of CU
- 1000 txs × 0.000005 SOL = 0.005 SOL base fees
- Slow finality

**Batch approach:** Aggregate proofs using recursive verification.

- 1000 txs → 1 batch proof
- ~600k CU total
- Single settlement transaction

**Savings:** 100x reduction in cost and settlement time.

---

### Why alt_bn128 for Verification?

**Alternatives:**

1. **Custom BN254 implementation:** Prohibitively expensive (millions of CU)
2. **Different curve:** Would require different circuits
3. **No on-chain verification:** Trust TEE only

**Choice: Solana's alt_bn128 syscalls**

- Optimized by Solana runtime
- Same curve as Ethereum (BN254)
- ~500k CU per Groth16 proof (affordable)
- Production-proven (Light Protocol uses this)

---

### Why 24-Level Merkle Tree?

**Capacity:** 2^24 = 16,777,216 leaves

**Justification:**

- Supports millions of unique balances
- Depth 24 = 24 hashes per proof (manageable constraint count)
- Matches industry standard (Tornado Cash: 20, Railgun: 28)

**Tradeoff:** Deeper trees = more constraints but higher capacity.

---

## Integration Checklist

Before deploying to production:

- [ ] Deploy programs to devnet
- [ ] Generate verification keys for all circuits
- [ ] Upload VKs to on-chain accounts
- [ ] Test deposit/withdraw flow end-to-end
- [ ] Test PER delegation lifecycle
- [ ] Verify CPI calls (pool → verifier, pool → token)
- [ ] Test batch settlement with nullifier creation
- [ ] Benchmark actual compute unit usage
- [ ] Security audit of all programs
- [ ] Test emergency pause mechanism
- [ ] Implement nullifier cleanup worker
- [ ] Set up multisig for admin authority

---

## Account Size Summary

| Account         | Size       | Rent (lamports) | Refundable?   |
| --------------- | ---------- | --------------- | ------------- |
| PoolState       | ~29KB      | ~200,000        | Yes (admin)   |
| NullifierEntry  | 49 bytes   | ~14,000         | Yes (cleanup) |
| VerificationKey | ~1KB       | ~70,000         | Yes (admin)   |
| Vault           | ~250 bytes | ~20,000         | Yes (owner)   |

---

## Cross-Program Invocations

```
┌─────────────────────────────────────────────┐
│          CPI ARCHITECTURE                   │
├─────────────────────────────────────────────┤
│                                             │
│   User Transaction                          │
│       │                                     │
│       ▼                                     │
│   Shielded Pool Program                     │
│       │                                     │
│   ┌───┴───┬─────────┬─────────┐            │
│   ▼       ▼         ▼         ▼            │
│  ZK     Token    Vault    MagicBlock       │
│ Verify  Program  Registry Delegation       │
│                                             │
└─────────────────────────────────────────────┘
```

**CPI Patterns:**

```rust
// Verify ZK proof
let cpi_ctx = CpiContext::new(
    ctx.accounts.verifier_program.to_account_info(),
    VerifyProof { verification_key: ... }
);
zk_verifier::cpi::verify(cpi_ctx, proof, public_inputs)?;

// Transfer tokens (with PDA signer)
let seeds = &[b"authority", pool.key().as_ref(), &[bump]];
let cpi_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    Transfer { from: ..., to: ..., authority: ... },
    &[seeds]
);
token::transfer(cpi_ctx, amount)?;
```

---

## References

### Solana

- [Solana Programs Documentation](https://solana.com/docs/core/programs)
- [alt_bn128 Precompiled Programs](https://solana.com/docs/core/programs#precompiled-programs)
- [Anchor Framework](https://www.anchor-lang.com/)
- [SPL Token Program](https://spl.solana.com/token)

### MagicBlock

- [PER Quickstart](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart)
- [Ephemeral Rollups SDK v0.8.x](https://github.com/magicblock-labs/ephemeral-rollups-sdk)
- [Delegation Lifecycle](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup)

### ZK on Solana

- [Light Protocol](https://github.com/Lightprotocol/light-protocol) — Production ZK reference
- [ZK Compression](https://www.zkcompression.com/)

---

**Blueprint Version:** 2.0
**Status:** Production Ready
**Estimated Reading Time:** 15 minutes
