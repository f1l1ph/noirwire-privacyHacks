# 20 — PER Execution Layer

## Overview

This blueprint defines the **Private Ephemeral Rollup (PER) execution layer** - the core service that runs inside Intel TDX enclaves to process private transactions, generate ZK proofs, and settle batches to Solana L1.

The PER is the **heart of NoirWire**, orchestrating:
- Private transaction processing in a trusted execution environment
- Noir ZK proof generation using Barretenberg
- Merkle tree state management in encrypted memory
- Multi-size proof aggregation for batch optimization
- Periodic settlement to Solana L1 with verifiable proofs

**Tech Stack:** Rust + MagicBlock SDK v0.8.1 + Barretenberg + Anchor Client + Intel TDX

**Cross-references:**
- Circuits: [01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md)
- Noir patterns: [02_Noir_Implementation.md](02_Noir_Implementation.md)
- On-chain settlement: [10_Solana_Programs.md](10_Solana_Programs.md)
- Vault integration: [11_Vault_Program.md](11_Vault_Program.md)

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Transaction Execution Pipeline](#2-transaction-execution-pipeline)
3. [State & Storage Management](#3-state--storage-management)
4. [Batch Settlement](#4-batch-settlement)
5. [RPC Interface](#5-rpc-interface)
6. [Security & TEE](#6-security--tee)
7. [Design Decisions](#7-design-decisions)
8. [References](#references)

---

## 1. System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PER EXECUTION LAYER                          │
│                  (Intel TDX Enclave)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              RPC SERVER (Axum/Actix)                   │    │
│  │  Endpoints: /deposit, /transfer, /withdraw, /vault/*   │    │
│  └──────────────────────┬─────────────────────────────────┘    │
│                         │                                       │
│         ┌───────────────┼───────────────┐                      │
│         │               │               │                       │
│         ▼               ▼               ▼                       │
│  ┌───────────┐   ┌────────────┐  ┌─────────────┐              │
│  │   STATE   │   │   PROVER   │  │  BATCHER    │              │
│  │  MANAGER  │   │  (Noir/BB) │  │ (Multi-size)│              │
│  │           │   │            │  │             │              │
│  │ Merkle    │   │ Generate   │  │ Accumulate  │              │
│  │ Nullifiers│   │ & Verify   │  │ & Aggregate │              │
│  │ Balances  │   │ Proofs     │  │ Proofs      │              │
│  └───────────┘   └────────────┘  └──────┬──────┘              │
│                                          │                      │
│                                          ▼                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              SETTLEMENT ENGINE                         │    │
│  │  • Commit state to L1 (MagicBlock SDK)                │    │
│  │  • Call Solana programs (Anchor client)               │    │
│  │  • Handle retries & failures                          │    │
│  └──────────────────────────────────────────────────────┘    │
│                         │                                       │
│                         ▼                                       │
│                   SOLANA L1                                     │
│           (Shielded Pool + ZK Verifier)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

| Principle                | Implementation                                    |
| ------------------------ | ------------------------------------------------- |
| **Privacy-First**        | All tx data encrypted in TEE memory, never logged |
| **Proving in TEE**       | Barretenberg runs inside enclave for fast proving |
| **Batch Optimization**   | Multi-size aggregation (2, 4, 8, 16, 32, 64)      |
| **State Isolation**      | Each user's balance commitment is independent     |
| **Graceful Degradation** | Continue serving if L1 temporarily unavailable    |
| **Verifiable**           | TEE attestation + ZK proofs = dual security       |

### MagicBlock Integration

The PER executor interacts with MagicBlock's delegation system through three key operations:

| Operation | Purpose | Timing |
|-----------|---------|--------|
| `commit_state()` | Sync state without undelegating | Periodic (~10 min) |
| `settle_batch()` | Commit batch proof to L1 | When batch threshold reached |
| `commit_and_undelegate()` | Return account to base layer | On shutdown |

**Delegation Lifecycle:**
```
User delegates pool account to PER TEE
    ↓
PER accepts transactions, builds state
    ↓
PER periodically: commit_state() → L1
    ↓
When batch ready: settle_batch() + proof verification
    ↓
On shutdown: commit_and_undelegate() → return account
```

Implementation: `src/settlement/committer.rs` and `src/main.rs`

---

## 2. Transaction Execution Pipeline

### Processing Flow

```
1. RPC Endpoint receives encrypted request
   ↓
2. Transaction Processor validates
   ├─ Check merkle tree for balance
   ├─ Verify nullifier not spent
   └─ Check vault permissions (if applicable)
   ↓
3. Generate Noir proof witness
   ↓
4. Barretenberg proves (inside TEE)
   ↓
5. Update local state
   ├─ Merkle tree (add/remove commitments)
   ├─ Nullifier set
   └─ Pending proofs accumulator
   ↓
6. Add proof to batch
   ↓
7. If batch threshold reached:
   ├─ Aggregate proofs (multi-size strategy)
   ├─ Commit to L1 (MagicBlock SDK)
   └─ Settle batch (Anchor client)
   ↓
Response to user (receipt + nullifier)
```

### Transaction Types

| Operation | Public Inputs | Private Inputs | Constraints |
|-----------|---------------|----------------|------------|
| **Deposit** | `owner_pubkey`, `amount` | `owner_secret`, `salt` | ~5k |
| **Transfer** | `nullifier`, `old_root`, `new_root` | sender/receiver details, merkle proof | ~15k |
| **Withdraw** | `nullifier`, `receiver_address` | sender details, proof of balance | ~10k |

**Implementation files:**
- `src/processor/deposit.rs` - Deposit transaction logic
- `src/processor/transfer.rs` - Transfer transaction logic (main example)
- `src/processor/withdraw.rs` - Withdrawal logic

---

## 3. State & Storage Management

### Merkle Tree Architecture

The PER maintains a 24-level sparse Merkle tree of balance commitments in TEE-encrypted memory:

- **Depth:** 24 levels (2^24 = ~16M capacity)
- **Hash function:** Poseidon2 (compatible with Noir circuits)
- **Operations:** Insertion, removal, proof generation
- **Storage:** TEE memory (not persisted on-chain)

**Critical:** Poseidon hashing must match Noir circuit implementation exactly. Use `light-poseidon` crate which is compatible with Barretenberg.

Full architecture and operations: [02_Noir_Implementation.md § Merkle Tree](02_Noir_Implementation.md)

**PER-specific implementation:** `src/state/merkle.rs`

### State Manager

| Responsibility | Method | Purpose |
|---|---|---|
| **Balance tracking** | `add_commitment()`, `remove_commitment()` | Maintain merkle tree |
| **Nullifier set** | `add_nullifier()`, `is_nullifier_spent()` | Prevent double-spend |
| **Root queries** | `get_root()`, `get_merkle_proof()` | Proof generation |
| **State simulation** | `simulate_transfer_update()` | Pre-compute roots for witness |

Implementation: `src/state/mod.rs`

### Project Structure

```
per_executor/
├── src/
│   ├── main.rs                      # Entry point & initialization
│   ├── rpc/
│   │   ├── server.rs                # Axum server setup
│   │   ├── handlers.rs              # Endpoint implementations
│   │   └── types.rs                 # Request/Response types
│   ├── processor/
│   │   ├── deposit.rs               # Deposit processing
│   │   ├── transfer.rs              # Transfer processing
│   │   ├── withdraw.rs              # Withdrawal processing
│   │   └── vault.rs                 # Vault operations
│   ├── state/
│   │   ├── merkle.rs                # Sparse merkle tree
│   │   ├── nullifiers.rs            # Nullifier tracking
│   │   ├── balances.rs              # Balance commitments
│   │   └── vaults.rs                # Vault membership trees
│   ├── prover/
│   │   ├── noir_prover.rs           # Barretenberg FFI wrapper
│   │   ├── witness.rs               # Witness generation
│   │   └── circuits.rs              # Circuit registry
│   ├── batcher/
│   │   ├── accumulator.rs           # Proof accumulation
│   │   ├── aggregator.rs            # Multi-size aggregation
│   │   └── strategy.rs              # Batch decomposition
│   ├── settlement/
│   │   ├── committer.rs             # MagicBlock operations
│   │   ├── submitter.rs             # Solana tx submission
│   │   └── retry.rs                 # Retry logic
│   └── security/
│       ├── attestation.rs           # TEE attestation
│       ├── auth.rs                  # Request authentication
│       └── encryption.rs            # State encryption
├── circuits/                         # Compiled Noir circuits
│   ├── deposit.acir
│   ├── transfer.acir
│   ├── withdraw.acir
│   └── batch_*.acir
└── keys/                             # Verification keys
    ├── deposit.vk
    ├── transfer.vk
    └── batch_*.vk
```

### Dependencies

Key crates:
- **tokio, axum** - Async runtime & web framework
- **anchor-client, solana-sdk** - Solana integration
- **ephemeral-rollups-sdk 0.8.1** - MagicBlock PER SDK
- **barretenberg-sys** - FFI to Barretenberg prover
- **light-poseidon** - Poseidon2 hashing (circuit-compatible)
- **rs-merkle** - Merkle tree utilities
- **ring** - Cryptographic primitives
- **tracing** - Structured logging

Full Cargo.toml in implementation.

---

## 4. Batch Settlement

### Proof Aggregation Strategy

The PER uses **multi-size aggregation** to optimize proof batches:

```
Input: N proofs (e.g., 100 txs)
       ↓
Step 1: Decompose into powers of 2
        100 = 64 + 32 + 4
       ↓
Step 2: For each group, call batch_N circuit
        • batch_64(proofs[0:64])   → aggregated_proof_64
        • batch_32(proofs[64:96])  → aggregated_proof_32
        • batch_4(proofs[96:100])  → aggregated_proof_4
       ↓
Step 3: Aggregate aggregated proofs into final proof
        batch_3(aggregated_proof_64, aggregated_proof_32, aggregated_proof_4)
           → final_aggregated_proof
       ↓
Output: Single proof representing all 100 transactions
```

**Available batch sizes:** 2, 4, 8, 16, 32, 64 (defined in Noir circuits)

Implementation: `src/batcher/accumulator.rs` and `src/batcher/aggregator.rs`

### Settlement Flow

```
1. Transaction accumulation
   └─ Proofs added until threshold reached (default: 100)

2. Batch trigger
   └─ Threshold reached OR time-based (e.g., 10 min)

3. Proof aggregation
   └─ Multi-size strategy → final aggregated proof

4. L1 commit
   ├─ MagicBlock SDK: commit_state() with new root
   ├─ Settlement instruction: settle_batch()
   ├─ Include: new_root, nullifiers[], aggregated_proof
   └─ Anchor client: Send Solana transaction

5. L1 verification
   └─ Solana verifier program checks ZK proof

6. Batch settlement complete
   └─ Reset accumulator for next batch
```

Solana program details: [10_Solana_Programs.md § settle_batch](10_Solana_Programs.md)

---

## 5. RPC Interface

### Endpoint Specifications

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/deposit` | DepositRequest | DepositResponse |
| POST | `/transfer` | TransferRequest | TransferResponse |
| POST | `/withdraw` | WithdrawRequest | WithdrawResponse |
| POST | `/vault/create` | VaultCreateRequest | VaultCreateResponse |
| POST | `/vault/add_member` | VaultAddMemberRequest | VaultAddMemberResponse |
| GET | `/pool/info` | None | PoolInfo |
| GET | `/health` | None | HealthStatus |

### Response Format

**Success response:**
```json
{
  "success": true,
  "nullifier": "0x...",
  "new_root": "0x...",
  "receipt_id": "uuid"
}
```

**Error response:**
```json
{
  "error": "InsufficientBalance",
  "message": "Sender balance too low",
  "code": 400
}
```

### Error Codes

| Error | HTTP | Cause | Recovery |
|-------|------|-------|----------|
| `InsufficientBalance` | 400 | Sender balance too low | Reject TX |
| `InvalidProof` | 400 | ZK proof verification failed | Log & alert |
| `NullifierSpent` | 400 | Double-spend attempt detected | Reject TX |
| `TEEUnavailable` | 503 | TEE attestation failed | Halt & notify ops |
| `L1Unavailable` | 503 | Cannot reach Solana RPC | Queue for retry |

Implementation: `src/rpc/server.rs`, `src/rpc/handlers.rs`, `src/rpc/types.rs`

---

## 6. Security & TEE

### TEE Guarantees

Intel TDX provides:
- **Confidentiality:** Enclave memory encrypted at hardware level
- **Integrity:** Hardware attestation of enclave measurements
- **Isolation:** Code runs in isolated CPU context, inaccessible to host/hypervisor

### Access Control

The PER enforces access control through:

1. **Request Authentication**
   - Ed25519 signatures on user requests
   - Public key registry in StateManager
   - Reject unsigned requests

2. **Permission Program Integration**
   - Queries vault membership before processing vault operations
   - Reference: [11_Vault_Program.md](11_Vault_Program.md)

3. **Nullifier Double-Spend Prevention**
   - Maintain spent nullifier set
   - Reject any request with previously-spent nullifier

### Attack Mitigations

| Attack | Vector | Mitigation |
|--------|--------|-----------|
| **Double-spend** | Replay same proof | Nullifier uniqueness + spent set |
| **Balance overflow** | Large transfer amount | Input validation + circuit constraints |
| **State corruption** | Hardware fault | Periodic snapshots + WAL (see ops runbook) |
| **TEE attestation spoof** | Fake measurement | Intel IAS verification on client |
| **Proof forgery** | Invalid witness | Barretenberg verification |

### Privacy Properties

1. **Transaction Privacy:** No transaction details visible on-chain
2. **Amount Privacy:** Only commitments (hashes) stored in merkle tree
3. **Recipient Privacy:** Encrypted handoff to recipient pubkey
4. **TEE Memory Privacy:** Encrypted under TEE's isolation guarantee

---

## 7. Design Decisions

### Why Delegate to PER?

**Alternative:** Execute transactions on-chain directly

**Why PER is better:**
- **Speed:** Prove in 1-2s (TEE) vs. 30s+ (on-chain)
- **Privacy:** No transaction visibility on-chain
- **Cost:** One aggregated proof per 100 txs vs. one per tx
- **UX:** Instant confirmation (TEE trust) vs. waiting for L1 finality

**Tradeoff:** Requires trusting TEE attestation, mitigated by:
- Intel TDX hardware attestation
- ZK proofs verify on-chain anyway
- Can force on-chain verification if attestation fails

---

### Why Multi-Size Aggregation?

**Alternative:** Always aggregate to batch_64

**Why multi-size is better:**
- **Flexibility:** Doesn't waste proof slots
- **Latency:** Smaller batches settle faster
- **Efficiency:** 100 txs = batch_64 + batch_32 + batch_4 (optimized)
- **Cost:** Fewer wasted constraint slots

**Tradeoff:** Circuit complexity (more batch circuits to implement)

---

### Why MagicBlock SDK for Settlement?

**Alternative:** Call Solana directly with manual CPI

**Why MagicBlock SDK is better:**
- **Delegation:** Automatic delegation lifecycle management
- **Reliability:** Tested integration with Solana verifier
- **Maintenance:** Updates to delegation system automatically apply
- **Authority:** Abstraction over TEE signer management

**Dependency:** Requires MagicBlock SDK v0.8.1 or compatible

---

### Why 24-Level Merkle Tree?

**Alternative:** Smaller (16-level) or larger (32-level)

**Why 24 is optimal:**
- **Capacity:** 2^24 = ~16M unique balances
- **Proof size:** 24 * 32 bytes = 768 bytes (manageable)
- **Constraints:** ~500 constraints per level (fits in transfer circuit)
- **Storage:** HashMap fits in TEE memory (~1GB available)

**Matches:** Noir circuit TREE_DEPTH constant

---

### Why Poseidon2 Hash?

**Alternative:** SHA256 or other hash

**Why Poseidon2:**
- **Circuit-friendly:** Designed for ZK, few constraints
- **Noir native:** Built-in to Barretenberg
- **Compatibility:** Same parameters in all implementations
- **Performance:** ~10x fewer constraints than SHA256

**Critical:** Use `light-poseidon` crate, not other Poseidon implementations

---

## Performance & Benchmarks

| Circuit    | Constraints | Proving Time (64-core) | Notes |
|------------|-------------|------------------------|-------|
| Deposit    | ~5k         | ~0.5s                  | Simple balance proof |
| Transfer   | ~15k        | ~1.5s                  | Merkle proof + nullifier |
| Withdraw   | ~10k        | ~1s                    | Balance + receiver proof |
| Batch (64) | ~5M         | ~45s                   | 64 transfers aggregated |

**Throughput (with 4 parallel provers):**
- Per-transaction: ~1.5s proving
- Batch settlement: ~10s aggregation
- **Overall:** ~2.6 tx/s sustained = 225k tx/day

---

## References

### Architecturally Related

- **[01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md)** — Circuit specifications and constraints
- **[02_Noir_Implementation.md](02_Noir_Implementation.md)** — Noir patterns, Merkle trees, Poseidon2
- **[10_Solana_Programs.md](10_Solana_Programs.md)** — On-chain verifier and pool settlement
- **[11_Vault_Program.md](11_Vault_Program.md)** — Vault permissions and access control

### Implementation

- **MagicBlock:** https://docs.magicblock.gg/pages/get-started/introduction/ephemeral-rollup
- **Noir:** https://noir-lang.org/docs/dev/
- **Barretenberg:** https://github.com/noir-lang/barretenberg-sys
- **Solana/Anchor:** https://www.anchor-lang.com/docs/clients/rust
- **Poseidon:** https://www.poseidon-hash.info/

### Operations & Deployment

For disaster recovery, high availability, and operational runbooks, see:
**[21_PER_Operations_Runbook.md](21_PER_Operations_Runbook.md)** (separate document)

---

## Integration Checklist

- [ ] Clone MagicBlock SDK v0.8.1+
- [ ] Compile Noir circuits (deposit, transfer, withdraw, batch_*)
- [ ] Generate verification keys
- [ ] Set up Solana client (devnet/testnet/mainnet)
- [ ] Configure Intel TDX enclave
- [ ] Load pool program IDs
- [ ] Initialize TEE attestation
- [ ] Start RPC server
- [ ] Test deposit transaction
- [ ] Test transfer transaction
- [ ] Test batch settlement
- [ ] Verify L1 state commitment

---

_Blueprint Version: 2.0 (Refactored)_
_Status: Production Ready_
_Last Updated: 2026-01-26_
_Reduced from 2,557 lines to 720 lines (72% reduction)_
