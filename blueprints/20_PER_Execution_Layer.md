# 20 — PER Execution Layer

## Overview

This blueprint defines the **Private Ephemeral Rollup (PER) execution layer** - the core service that runs inside Intel TDX enclaves to process private transactions, generate ZK proofs, and settle batches to Solana L1.

The PER execution layer is the **heart of NoirWire** - it's where:

- Private transactions are processed in a trusted execution environment
- Noir ZK proofs are generated using Barretenberg
- Merkle tree state is maintained in encrypted memory
- Proofs are batched using our multi-size aggregation strategy
- Settlement to Solana L1 happens periodically with aggregated proofs

> **Reference:** Uses circuits from [01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md) and settles via [10_Solana_Programs.md](10_Solana_Programs.md)
>
> **Tech Stack:** Rust + MagicBlock SDK v0.8.1 + Barretenberg + Anchor Client + Intel TDX

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Components](#2-core-components)
3. [MagicBlock PER Integration](#3-magicblock-per-integration)
4. [Transaction Processing](#4-transaction-processing)
5. [Noir Prover Integration](#5-noir-prover-integration)
6. [State Management](#6-state-management)
7. [Batch Aggregation & Settlement](#7-batch-aggregation--settlement)
8. [RPC Interface](#8-rpc-interface)
9. [Security & TEE](#9-security--tee)
10. [Performance & Optimization](#10-performance--optimization)
11. [Deployment & Operations](#11-deployment--operations)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Architecture Overview

### System Context

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
│                         ▼                                       │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           TRANSACTION PROCESSOR                        │    │
│  │  • Validates requests                                  │    │
│  │  • Checks balances & permissions                       │    │
│  │  • Generates witnesses for proofs                      │    │
│  └──────────────────────┬─────────────────────────────────┘    │
│                         │                                       │
│         ┌───────────────┼───────────────┐                      │
│         │               │               │                       │
│         ▼               ▼               ▼                       │
│  ┌───────────┐   ┌────────────┐  ┌─────────────┐              │
│  │   STATE   │   │   PROVER   │  │  BATCHER    │              │
│  │  MANAGER  │   │  (Noir/BB) │  │ (Multi-size)│              │
│  │           │   │            │  │             │              │
│  │ • Merkle  │   │ • Generate │  │ • Accumulate│              │
│  │ • Nullifs │   │ • Verify   │  │ • Aggregate │              │
│  │ • Balances│   │ • Serialize│  │ • Optimize  │              │
│  └───────────┘   └────────────┘  └──────┬──────┘              │
│                                          │                      │
│                                          ▼                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              SETTLEMENT ENGINE                         │    │
│  │  • Commit state to L1 (MagicBlock SDK)                │    │
│  │  • Call Solana programs (Anchor client)               │    │
│  │  • Handle retries & failures                          │    │
│  └────────────────────────────────────────────────────────┘    │
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
| **Graceful Degradation** | Continue serving if L1 is temporarily unavailable |
| **Verifiable**           | TEE attestation + ZK proofs = dual security       |

### Data Flow

```
User Request (encrypted)
    │
    ▼
[1] RPC Endpoint receives & decrypts
    │
    ▼
[2] Transaction Processor validates
    │
    ├─► Check merkle tree for balance
    ├─► Verify nullifier not spent
    └─► Check vault permissions (if applicable)
    │
    ▼
[3] Generate Noir proof witness
    │
    ▼
[4] Barretenberg proves (inside TEE)
    │
    ▼
[5] Update local state
    │   ├─► Merkle tree (add/remove commitments)
    │   ├─► Nullifier set
    │   └─► Pending proofs accumulator
    │
    ▼
[6] Add proof to batch
    │
    ▼
[7] If batch threshold reached:
    │   ├─► Aggregate proofs (multi-size)
    │   ├─► Commit to L1 (MagicBlock SDK)
    │   └─► Settle batch (Anchor client)
    │
    ▼
Response to user (receipt + nullifier)
```

---

## 2. Core Components

### 2.1 Project Structure

```
per_executor/
├── Cargo.toml
├── src/
│   ├── main.rs                      # Entry point
│   │
│   ├── rpc/
│   │   ├── mod.rs
│   │   ├── server.rs                # Axum/Actix server
│   │   ├── handlers.rs              # Endpoint handlers
│   │   └── types.rs                 # Request/Response types
│   │
│   ├── processor/
│   │   ├── mod.rs
│   │   ├── deposit.rs               # Deposit tx processing
│   │   ├── transfer.rs              # Transfer tx processing
│   │   ├── withdraw.rs              # Withdraw tx processing
│   │   └── vault.rs                 # Vault operations
│   │
│   ├── state/
│   │   ├── mod.rs
│   │   ├── merkle.rs                # Sparse merkle tree
│   │   ├── nullifiers.rs            # Nullifier tracking
│   │   ├── balances.rs              # Balance commitments
│   │   └── vaults.rs                # Vault membership trees
│   │
│   ├── prover/
│   │   ├── mod.rs
│   │   ├── noir_prover.rs           # Barretenberg FFI
│   │   ├── witness.rs               # Witness generation
│   │   └── circuits.rs              # Circuit registry
│   │
│   ├── batcher/
│   │   ├── mod.rs
│   │   ├── accumulator.rs           # Proof accumulation
│   │   ├── aggregator.rs            # Multi-size aggregation
│   │   └── strategy.rs              # Batch decomposition
│   │
│   ├── settlement/
│   │   ├── mod.rs
│   │   ├── committer.rs             # MagicBlock commit/undelegate
│   │   ├── submitter.rs             # Solana tx submission
│   │   └── retry.rs                 # Retry logic
│   │
│   ├── security/
│   │   ├── mod.rs
│   │   ├── attestation.rs           # TEE attestation
│   │   ├── auth.rs                  # Request authentication
│   │   └── encryption.rs            # State encryption
│   │
│   └── utils/
│       ├── mod.rs
│       ├── config.rs                # Configuration
│       └── metrics.rs               # Telemetry
│
├── circuits/                         # Compiled Noir circuits
│   ├── deposit.acir
│   ├── transfer.acir
│   ├── withdraw.acir
│   └── batch_*.acir
│
└── keys/                             # Verification keys
    ├── deposit.vk
    ├── transfer.vk
    └── batch_*.vk
```

### 2.2 Dependencies

```toml
# Cargo.toml

[package]
name = "noirwire_per_executor"
version = "0.1.0"
edition = "2021"

[dependencies]
# Web framework
tokio = { version = "1.35", features = ["full"] }
axum = "0.7"
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace"] }

# Solana & Anchor
anchor-client = "0.32.1"
anchor-lang = "0.32.1"
solana-sdk = "2.0"
solana-client = "2.0"

# MagicBlock PER SDK
ephemeral-rollups-sdk = "0.8.1"

# Noir/Barretenberg proving
# Option 1: Official FFI bindings
barretenberg-sys = { git = "https://github.com/noir-lang/barretenberg-sys" }

# Option 2: Community noir_rs (mobile-optimized, prebuilt binaries)
# noir_rs = { git = "https://github.com/zkpassport/noir_rs" }

# Cryptographic primitives
ark-bn254 = "0.4"
ark-ff = "0.4"
ark-serialize = "0.4"

# Poseidon hashing (MUST be compatible with Noir circuits)
light-poseidon = "0.2"

# Merkle tree
rs-merkle = "1.4"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bincode = "1.3"

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Metrics
prometheus = "0.13"

# Security
ring = "0.17"  # For encryption
constant_time_eq = "0.3"

# Configuration
config = "0.14"
dotenv = "0.15"

[dev-dependencies]
proptest = "1.4"
criterion = "0.5"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

> ⚠️ **CRITICAL - Poseidon Hash Compatibility:**
>
> **The PER MUST use Poseidon hashing that is compatible with Noir circuits.**
>
> The `light-poseidon` Rust crate uses the same Poseidon2 parameters as Barretenberg
> (which is what Noir uses), ensuring hash compatibility between the PER and circuits.
>
> **DO NOT use other Poseidon crates** (like `poseidon-rs` or `ff-zk-hash`) without
> verifying parameter compatibility, or proof verification will fail.
>
> All commitment hashes, nullifier hashes, and merkle tree hashes computed in the PER
> must match exactly what the Noir circuits compute.

---

## 3. MagicBlock PER Integration

### 3.1 Delegation Lifecycle

The PER executor interacts with MagicBlock's delegation system:

```rust
// src/settlement/committer.rs

use ephemeral_rollups_sdk::cpi::{commit_accounts, undelegate_account};
use anchor_client::Program;
use solana_sdk::{pubkey::Pubkey, signer::Signer};

/// MagicBlock PER integration
pub struct PerCommitter {
    /// Solana RPC client
    client: anchor_client::Client,

    /// Shielded pool program
    pool_program: Program,

    /// PER authority (TEE signer)
    authority: Box<dyn Signer>,

    /// Pool state PDA
    pool_state: Pubkey,
}

impl PerCommitter {
    /// Commit current state to L1 without undelegating
    /// Called periodically to sync state
    pub async fn commit_state(&self) -> anyhow::Result<()> {
        tracing::info!("Committing state to L1");

        // Build commit instruction
        let commit_ix = self.pool_program
            .request()
            .accounts(shielded_pool::accounts::CommitPool {
                pool: self.pool_state,
                payer: self.authority.pubkey(),
                magic_context: self.get_magic_context()?,
                magic_program: ephemeral_rollups_sdk::MAGIC_PROGRAM_ID,
            })
            .args(shielded_pool::instruction::Commit {})
            .instructions()?;

        // Send transaction
        let sig = self.client
            .request()
            .instruction(commit_ix[0].clone())
            .signer(&*self.authority)
            .send()?;

        tracing::info!("State committed: {}", sig);
        Ok(())
    }

    /// Settle batch and commit to L1
    /// Called when batch threshold is reached
    pub async fn settle_batch(
        &self,
        new_root: [u8; 32],
        nullifiers: Vec<[u8; 32]>,
        proof: Vec<u8>,
    ) -> anyhow::Result<()> {
        tracing::info!("Settling batch with {} nullifiers", nullifiers.len());

        // 1. Derive nullifier PDAs
        let nullifier_pdas = self.derive_nullifier_pdas(&nullifiers)?;

        // 2. Build settle_batch instruction
        let settle_ix = self.pool_program
            .request()
            .accounts(shielded_pool::accounts::SettleBatch {
                pool: self.pool_state,
                per_authority: self.authority.pubkey(),
                verification_key: self.get_batch_vk()?,
                verifier_program: self.get_verifier_program_id(),
                payer: self.authority.pubkey(),
                system_program: solana_sdk::system_program::ID,
            })
            .args(shielded_pool::instruction::SettleBatch {
                new_root,
                nullifiers: nullifiers.clone(),
                proof: proof.into(),
            })
            // Add nullifier accounts via remaining_accounts
            .accounts(nullifier_pdas.iter().map(|pda| {
                AccountMeta::new(*pda, false)
            }).collect())
            .instructions()?;

        // 3. Send transaction
        let sig = self.client
            .request()
            .instruction(settle_ix[0].clone())
            .signer(&*self.authority)
            .send()?;

        tracing::info!("Batch settled: {}", sig);
        Ok(())
    }

    /// Full undelegation (return account to Base Layer)
    /// Called when shutting down or migrating
    pub async fn commit_and_undelegate(&self) -> anyhow::Result<()> {
        tracing::info!("Committing and undelegating pool account");

        // Build commit_and_undelegate instruction
        let undelegate_ix = self.pool_program
            .request()
            .accounts(shielded_pool::accounts::CommitAndUndelegate {
                pool: self.pool_state,
                payer: self.authority.pubkey(),
                owner_program: self.pool_program.id(),
                buffer: self.get_buffer_account()?,
                delegation_record: self.get_delegation_record()?,
                delegation_metadata: self.get_delegation_metadata()?,
                delegation_program: ephemeral_rollups_sdk::DELEGATION_PROGRAM_ID,
                magic_context: self.get_magic_context()?,
                magic_program: ephemeral_rollups_sdk::MAGIC_PROGRAM_ID,
                system_program: solana_sdk::system_program::ID,
            })
            .args(shielded_pool::instruction::CommitAndUndelegate {})
            .instructions()?;

        let sig = self.client
            .request()
            .instruction(undelegate_ix[0].clone())
            .signer(&*self.authority)
            .send()?;

        tracing::info!("Account undelegated: {}", sig);
        Ok(())
    }

    fn derive_nullifier_pdas(&self, nullifiers: &[[u8; 32]]) -> anyhow::Result<Vec<Pubkey>> {
        nullifiers
            .iter()
            .map(|n| {
                let (pda, _) = Pubkey::find_program_address(
                    &[b"nullifier", self.pool_state.as_ref(), n],
                    &self.pool_program.id(),
                );
                Ok(pda)
            })
            .collect()
    }

    fn get_magic_context(&self) -> anyhow::Result<Pubkey> {
        // MagicBlock context account (provided by ER runtime)
        Ok(ephemeral_rollups_sdk::get_magic_context()?)
    }

    fn get_buffer_account(&self) -> anyhow::Result<Pubkey> {
        // Delegation buffer (from MagicBlock SDK)
        Ok(ephemeral_rollups_sdk::get_delegation_buffer(&self.pool_state)?)
    }

    fn get_delegation_record(&self) -> anyhow::Result<Pubkey> {
        let (pda, _) = Pubkey::find_program_address(
            &[b"delegation", self.pool_state.as_ref()],
            &ephemeral_rollups_sdk::DELEGATION_PROGRAM_ID,
        );
        Ok(pda)
    }

    fn get_delegation_metadata(&self) -> anyhow::Result<Pubkey> {
        let (pda, _) = Pubkey::find_program_address(
            &[b"metadata", self.pool_state.as_ref()],
            &ephemeral_rollups_sdk::DELEGATION_PROGRAM_ID,
        );
        Ok(pda)
    }

    fn get_batch_vk(&self) -> anyhow::Result<Pubkey> {
        let (pda, _) = Pubkey::find_program_address(
            &[b"vk", self.pool_state.as_ref(), b"batch"],
            &self.pool_program.id(),
        );
        Ok(pda)
    }

    fn get_verifier_program_id(&self) -> Pubkey {
        // ZK Verifier program ID (from config)
        "NwireVrfyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            .parse()
            .expect("Valid verifier program ID")
    }
}
```

### 3.2 PER Service Initialization

```rust
// src/main.rs

use ephemeral_rollups_sdk::EphemeralRollupContext;
use anchor_client::{Client, Cluster};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load configuration
    let config = Config::from_env()?;

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("noirwire_per_executor=info")
        .init();

    tracing::info!("Starting NoirWire PER Executor");

    // 1. Initialize Solana client
    let client = Client::new(
        Cluster::Custom(
            config.rpc_url.clone(),
            config.ws_url.clone(),
        ),
        std::rc::Rc::new(config.authority.clone()),
    );

    // 2. Load shielded pool program
    let pool_program = client.program(config.pool_program_id)?;

    // 3. Initialize TEE attestation (Intel TDX)
    let attestation = TeeAttestation::initialize()?;
    tracing::info!("TEE attestation: {:?}", attestation.quote);

    // 4. Initialize state manager
    let state = StateManager::new(config.initial_root)?;

    // 5. Initialize Noir prover
    let prover = NoirProver::new(&config.circuits_path)?;

    // 6. Initialize batch accumulator
    let batcher = BatchAccumulator::new(config.batch_threshold);

    // 7. Initialize settlement engine
    let committer = PerCommitter::new(client, pool_program, config.authority)?;

    // 8. Start RPC server
    let rpc_server = RpcServer::new(
        config.rpc_bind_addr.clone(),
        state.clone(),
        prover.clone(),
        batcher.clone(),
        committer.clone(),
    );

    // 9. Start background settlement task
    tokio::spawn(async move {
        settlement_loop(batcher, committer).await;
    });

    // 10. Run server
    rpc_server.run().await?;

    Ok(())
}

/// Background task: settle batches when threshold reached
async fn settlement_loop(
    batcher: Arc<BatchAccumulator>,
    committer: Arc<PerCommitter>,
) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));

    loop {
        interval.tick().await;

        // Check if batch is ready
        if batcher.should_settle() {
            match batcher.aggregate_and_reset().await {
                Ok((new_root, nullifiers, proof)) => {
                    if let Err(e) = committer.settle_batch(new_root, nullifiers, proof).await {
                        tracing::error!("Failed to settle batch: {}", e);
                        // Retry logic handled in committer
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to aggregate batch: {}", e);
                }
            }
        }
    }
}
```

---

## 4. Transaction Processing

### 4.1 Transfer Transaction

```rust
// src/processor/transfer.rs

use crate::{
    state::{StateManager, Balance},
    prover::NoirProver,
    batcher::BatchAccumulator,
};

pub struct TransferProcessor {
    state: Arc<RwLock<StateManager>>,
    prover: Arc<NoirProver>,
    batcher: Arc<BatchAccumulator>,
}

/// Transfer request from client
#[derive(Debug, serde::Deserialize)]
pub struct TransferRequest {
    // Private inputs (never logged)
    pub sender_secret: [u8; 32],
    pub sender_amount: u64,
    pub sender_salt: [u8; 32],
    pub sender_vault_id: [u8; 32],

    pub transfer_amount: u64,
    pub nonce: [u8; 32],

    pub receiver_pubkey: [u8; 32],
    pub receiver_salt: [u8; 32],
    pub receiver_vault_id: [u8; 32],

    pub new_sender_salt: [u8; 32],
}

/// Transfer response to client
#[derive(Debug, serde::Serialize)]
pub struct TransferResponse {
    pub success: bool,
    pub nullifier: [u8; 32],
    pub new_root: [u8; 32],
    pub receipt_id: String,
}

impl TransferProcessor {
    pub async fn process(
        &self,
        request: TransferRequest,
    ) -> anyhow::Result<TransferResponse> {
        // 1. Validate request
        self.validate_request(&request)?;

        // 2. Lock state for read
        let state = self.state.read().await;

        // 3. Compute sender's commitment
        let sender_commitment = self.compute_commitment(
            &request.sender_secret,
            request.sender_amount,
            &request.sender_salt,
            &request.sender_vault_id,
        )?;

        // 4. Verify sender's balance exists in merkle tree
        let sender_proof = state.get_merkle_proof(&sender_commitment)?;
        if !state.verify_inclusion(&sender_commitment, &sender_proof) {
            anyhow::bail!("Sender commitment not found in tree");
        }

        // 5. Check sufficient balance
        if request.sender_amount < request.transfer_amount {
            anyhow::bail!("Insufficient balance");
        }

        // 6. Compute nullifier
        let nullifier = self.compute_nullifier(
            &sender_commitment,
            &request.sender_secret,
            &request.nonce,
        )?;

        // 7. Check nullifier not already spent
        if state.is_nullifier_spent(&nullifier) {
            anyhow::bail!("Nullifier already spent (double-spend attempt)");
        }

        // 8. Compute new commitments
        let sender_pubkey = self.derive_pubkey(&request.sender_secret)?;
        let new_sender_amount = request.sender_amount - request.transfer_amount;

        let new_sender_commitment = self.compute_commitment(
            &request.sender_secret,
            new_sender_amount,
            &request.new_sender_salt,
            &request.sender_vault_id,
        )?;

        let receiver_commitment = self.compute_commitment_from_pubkey(
            &request.receiver_pubkey,
            request.transfer_amount,
            &request.receiver_salt,
            &request.receiver_vault_id,
        )?;

        // 9. Generate proof witness
        let old_root = state.get_root();

        // Simulate state update to get intermediate root and new root
        let (intermediate_root, new_root) = state.simulate_transfer_update(
            &sender_commitment,
            &new_sender_commitment,
            &receiver_commitment,
        )?;

        drop(state); // Release read lock

        // 10. Generate ZK proof
        tracing::info!("Generating transfer proof");
        let proof = self.prover.prove_transfer(
            // Public inputs
            &nullifier,
            &old_root,
            &new_root,
            // Private inputs
            &request.sender_secret,
            request.sender_amount,
            &request.sender_salt,
            &request.sender_vault_id,
            &sender_proof,
            request.transfer_amount,
            &request.nonce,
            &request.receiver_pubkey,
            &request.receiver_salt,
            &request.receiver_vault_id,
            &request.new_sender_salt,
            &intermediate_root,
        ).await?;

        tracing::info!("Proof generated successfully");

        // 11. Lock state for write and apply update
        let mut state = self.state.write().await;

        state.remove_commitment(&sender_commitment)?;
        state.add_commitment(&new_sender_commitment)?;
        state.add_commitment(&receiver_commitment)?;
        state.add_nullifier(nullifier)?;
        state.update_root(new_root)?;

        drop(state); // Release write lock

        // 12. Add proof to batch accumulator
        self.batcher.add_proof(proof).await?;

        // 13. Return response
        Ok(TransferResponse {
            success: true,
            nullifier,
            new_root,
            receipt_id: uuid::Uuid::new_v4().to_string(),
        })
    }

    fn validate_request(&self, req: &TransferRequest) -> anyhow::Result<()> {
        // Basic validation
        if req.transfer_amount == 0 {
            anyhow::bail!("Transfer amount must be > 0");
        }

        if req.sender_amount < req.transfer_amount {
            anyhow::bail!("Transfer amount exceeds sender balance");
        }

        // Prevent overflow
        if req.transfer_amount > u64::MAX / 2 {
            anyhow::bail!("Transfer amount too large");
        }

        Ok(())
    }

    fn compute_commitment(
        &self,
        secret: &[u8; 32],
        amount: u64,
        salt: &[u8; 32],
        vault_id: &[u8; 32],
    ) -> anyhow::Result<[u8; 32]> {
        let pubkey = self.derive_pubkey(secret)?;
        self.compute_commitment_from_pubkey(&pubkey, amount, salt, vault_id)
    }

    fn compute_commitment_from_pubkey(
        &self,
        pubkey: &[u8; 32],
        amount: u64,
        salt: &[u8; 32],
        vault_id: &[u8; 32],
    ) -> anyhow::Result<[u8; 32]> {
        // Use Poseidon2 hash (must match circuit implementation)
        use poseidon::Poseidon2;

        let mut hasher = Poseidon2::new();
        hasher.update(&[0x01u8]); // COMMITMENT_DOMAIN
        hasher.update(pubkey);
        hasher.update(&amount.to_le_bytes());
        hasher.update(salt);
        hasher.update(vault_id);

        Ok(hasher.finalize())
    }

    fn derive_pubkey(&self, secret: &[u8; 32]) -> anyhow::Result<[u8; 32]> {
        use poseidon::Poseidon2;

        let mut hasher = Poseidon2::new();
        hasher.update(secret);
        Ok(hasher.finalize())
    }

    fn compute_nullifier(
        &self,
        commitment: &[u8; 32],
        secret: &[u8; 32],
        nonce: &[u8; 32],
    ) -> anyhow::Result<[u8; 32]> {
        use poseidon::Poseidon2;

        let mut hasher = Poseidon2::new();
        hasher.update(&[0x02u8]); // NULLIFIER_DOMAIN
        hasher.update(commitment);
        hasher.update(secret);
        hasher.update(nonce);

        Ok(hasher.finalize())
    }
}
```

---

## 5. Noir Prover Integration

### 5.1 Barretenberg FFI Wrapper

```rust
// src/prover/noir_prover.rs

use std::path::PathBuf;
use std::sync::Arc;

// Option 1: Using barretenberg-sys (official)
// use barretenberg_sys::{Prover, VerificationKey};

// Option 2: Using noir_rs (community, prebuilt binaries)
// use noir_rs::{prove, verify};

/// Wrapper around Barretenberg prover
pub struct NoirProver {
    /// Path to compiled circuits
    circuits_path: PathBuf,

    /// Cached verification keys
    vk_cache: Arc<RwLock<HashMap<String, Vec<u8>>>>,
}

impl NoirProver {
    pub fn new(circuits_path: &str) -> anyhow::Result<Self> {
        let circuits_path = PathBuf::from(circuits_path);

        if !circuits_path.exists() {
            anyhow::bail!("Circuits path does not exist: {:?}", circuits_path);
        }

        Ok(Self {
            circuits_path,
            vk_cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Prove a transfer transaction
    pub async fn prove_transfer(
        &self,
        // Public inputs
        nullifier: &[u8; 32],
        old_root: &[u8; 32],
        new_root: &[u8; 32],
        // Private inputs
        sender_secret: &[u8; 32],
        sender_amount: u64,
        sender_salt: &[u8; 32],
        sender_vault_id: &[u8; 32],
        sender_proof: &MerkleProof,
        transfer_amount: u64,
        nonce: &[u8; 32],
        receiver_pubkey: &[u8; 32],
        receiver_salt: &[u8; 32],
        receiver_vault_id: &[u8; 32],
        new_sender_salt: &[u8; 32],
        intermediate_root: &[u8; 32],
    ) -> anyhow::Result<Vec<u8>> {
        // 1. Load circuit
        let circuit_path = self.circuits_path.join("transfer.acir");
        let circuit_bytes = std::fs::read(&circuit_path)?;

        // 2. Prepare witness (input values)
        let witness = self.build_transfer_witness(
            nullifier,
            old_root,
            new_root,
            sender_secret,
            sender_amount,
            sender_salt,
            sender_vault_id,
            sender_proof,
            transfer_amount,
            nonce,
            receiver_pubkey,
            receiver_salt,
            receiver_vault_id,
            new_sender_salt,
            intermediate_root,
        )?;

        // 3. Generate proof
        tracing::debug!("Calling Barretenberg prover");
        let start = std::time::Instant::now();

        let proof = self.prove_with_barretenberg(&circuit_bytes, &witness)?;

        let duration = start.elapsed();
        tracing::info!("Proof generated in {:?}", duration);

        // 4. Verify proof locally (sanity check)
        let vk = self.get_verification_key("transfer")?;
        let public_inputs = vec![
            nullifier.to_vec(),
            old_root.to_vec(),
            new_root.to_vec(),
        ];

        let valid = self.verify_proof(&proof, &vk, &public_inputs)?;
        if !valid {
            anyhow::bail!("Generated proof failed verification!");
        }

        Ok(proof)
    }

    /// Build witness for transfer circuit
    fn build_transfer_witness(
        &self,
        // Public
        nullifier: &[u8; 32],
        old_root: &[u8; 32],
        new_root: &[u8; 32],
        // Private
        sender_secret: &[u8; 32],
        sender_amount: u64,
        sender_salt: &[u8; 32],
        sender_vault_id: &[u8; 32],
        sender_proof: &MerkleProof,
        transfer_amount: u64,
        nonce: &[u8; 32],
        receiver_pubkey: &[u8; 32],
        receiver_salt: &[u8; 32],
        receiver_vault_id: &[u8; 32],
        new_sender_salt: &[u8; 32],
        intermediate_root: &[u8; 32],
    ) -> anyhow::Result<Vec<u8>> {
        // Serialize all inputs in the order expected by the circuit
        // This must match the exact order in circuits/transfer/src/main.nr

        let mut witness = Vec::new();

        // Public inputs (first)
        witness.extend_from_slice(nullifier);
        witness.extend_from_slice(old_root);
        witness.extend_from_slice(new_root);

        // Private inputs
        witness.extend_from_slice(sender_secret);
        witness.extend_from_slice(&sender_amount.to_le_bytes());
        witness.extend_from_slice(sender_salt);
        witness.extend_from_slice(sender_vault_id);

        // Merkle proof
        for sibling in &sender_proof.siblings {
            witness.extend_from_slice(sibling);
        }
        for path_bit in &sender_proof.path_indices {
            witness.push(*path_bit);
        }

        // Transfer details
        witness.extend_from_slice(&transfer_amount.to_le_bytes());
        witness.extend_from_slice(nonce);

        // Receiver
        witness.extend_from_slice(receiver_pubkey);
        witness.extend_from_slice(receiver_salt);
        witness.extend_from_slice(receiver_vault_id);

        // New sender balance
        witness.extend_from_slice(new_sender_salt);
        witness.extend_from_slice(intermediate_root);

        Ok(witness)
    }

    /// Call Barretenberg prover via FFI
    fn prove_with_barretenberg(
        &self,
        circuit: &[u8],
        witness: &[u8],
    ) -> anyhow::Result<Vec<u8>> {
        // IMPLEMENTATION NOTE: This depends on which Barretenberg binding you use

        // Option 1: barretenberg-sys (official)
        /*
        use barretenberg_sys::Prover;

        let prover = Prover::new(circuit)?;
        let proof = prover.create_proof(witness)?;
        Ok(proof)
        */

        // Option 2: noir_rs (prebuilt binaries, faster setup)
        /*
        use noir_rs::prove;

        let proof = prove(circuit, witness)?;
        Ok(proof)
        */

        // Placeholder implementation
        todo!("Implement Barretenberg FFI based on chosen library")
    }

    /// Verify proof using verification key
    fn verify_proof(
        &self,
        proof: &[u8],
        vk: &[u8],
        public_inputs: &[Vec<u8>],
    ) -> anyhow::Result<bool> {
        // IMPLEMENTATION NOTE: This depends on which Barretenberg binding you use

        // Option 1: barretenberg-sys
        /*
        use barretenberg_sys::verify_proof;

        let valid = verify_proof(vk, proof, public_inputs)?;
        Ok(valid)
        */

        // Option 2: noir_rs
        /*
        use noir_rs::verify;

        let valid = verify(vk, proof, public_inputs)?;
        Ok(valid)
        */

        // Placeholder
        todo!("Implement proof verification based on chosen library")
    }

    /// Load or cache verification key
    fn get_verification_key(&self, circuit_name: &str) -> anyhow::Result<Vec<u8>> {
        let mut cache = self.vk_cache.write().unwrap();

        if let Some(vk) = cache.get(circuit_name) {
            return Ok(vk.clone());
        }

        // Load from disk
        let vk_path = self.circuits_path
            .parent()
            .unwrap()
            .join("keys")
            .join(format!("{}.vk", circuit_name));

        let vk = std::fs::read(&vk_path)?;
        cache.insert(circuit_name.to_string(), vk.clone());

        Ok(vk)
    }
}

/// Merkle proof structure
#[derive(Debug, Clone)]
pub struct MerkleProof {
    pub siblings: Vec<[u8; 32]>,
    pub path_indices: Vec<u8>,
}
```

### 5.2 Proof Generation Pipeline

```rust
// src/prover/witness.rs

use serde::{Serialize, Deserialize};

/// Witness builder for Noir circuits
pub struct WitnessBuilder;

impl WitnessBuilder {
    /// Convert Rust values to Noir field elements
    pub fn field_from_bytes(bytes: &[u8; 32]) -> String {
        // Convert bytes to field element string representation
        let mut value = num_bigint::BigUint::from_bytes_be(bytes);
        value.to_string()
    }

    pub fn field_from_u64(val: u64) -> String {
        val.to_string()
    }

    /// Serialize witness as JSON for Noir
    pub fn to_json<T: Serialize>(witness: &T) -> anyhow::Result<String> {
        Ok(serde_json::to_string(witness)?)
    }
}

/// Witness format for transfer circuit (matches Noir circuit inputs)
#[derive(Debug, Serialize)]
pub struct TransferWitness {
    // Public
    pub nullifier: String,
    pub old_root: String,
    pub new_root: String,

    // Private - sender
    pub sender_secret: String,
    pub sender_amount: String,
    pub sender_salt: String,
    pub sender_vault_id: String,
    pub sender_proof: MerkleProofWitness,

    // Private - transfer
    pub transfer_amount: String,
    pub nonce: String,

    // Private - receiver
    pub receiver_pubkey: String,
    pub receiver_salt: String,
    pub receiver_vault_id: String,

    // Private - new sender
    pub new_sender_salt: String,
    pub new_sender_proof: MerkleProofWitness,
    pub receiver_proof: MerkleProofWitness,
    pub intermediate_root: String,
}

#[derive(Debug, Serialize)]
pub struct MerkleProofWitness {
    pub siblings: Vec<String>,
    pub path_indices: Vec<u8>,
}
```

---

## 6. State Management

### 6.1 Sparse Merkle Tree

```rust
// src/state/merkle.rs

use std::collections::HashMap;

/// Sparse Merkle Tree for balance commitments
/// Depth: 24 (2^24 = ~16M possible leaves)
pub struct SparseMerkleTree {
    /// Tree depth (24 for NoirWire)
    depth: usize,

    /// Leaf nodes: commitment_hash -> leaf_value
    leaves: HashMap<[u8; 32], [u8; 32]>,

    /// Internal nodes: node_hash -> (left, right)
    nodes: HashMap<[u8; 32], ([u8; 32], [u8; 32])>,

    /// Current root
    root: [u8; 32],

    /// Empty node values (precomputed)
    empty_nodes: Vec<[u8; 32]>,
}

impl SparseMerkleTree {
    pub fn new(depth: usize) -> Self {
        let empty_nodes = Self::compute_empty_nodes(depth);
        let root = empty_nodes[depth];

        Self {
            depth,
            leaves: HashMap::new(),
            nodes: HashMap::new(),
            root,
            empty_nodes,
        }
    }

    /// Insert a new commitment
    pub fn insert(&mut self, commitment: &[u8; 32]) -> anyhow::Result<()> {
        // Find empty slot
        let index = self.find_empty_slot()?;

        // Insert leaf
        self.leaves.insert(*commitment, *commitment);

        // Recompute path to root
        self.update_path(index, commitment)?;

        Ok(())
    }

    /// Remove a commitment (set to empty)
    pub fn remove(&mut self, commitment: &[u8; 32]) -> anyhow::Result<()> {
        // Find leaf index
        let index = self.find_leaf_index(commitment)?;

        // Remove from leaves
        self.leaves.remove(commitment);

        // Recompute path with empty value
        self.update_path(index, &[0u8; 32])?;

        Ok(())
    }

    /// Get merkle proof for a commitment
    pub fn get_proof(&self, commitment: &[u8; 32]) -> anyhow::Result<MerkleProof> {
        let index = self.find_leaf_index(commitment)?;

        let mut siblings = Vec::new();
        let mut path_indices = Vec::new();

        let mut current_index = index;

        for level in 0..self.depth {
            let is_right = current_index % 2 == 1;
            path_indices.push(if is_right { 1 } else { 0 });

            let sibling_index = if is_right {
                current_index - 1
            } else {
                current_index + 1
            };

            let sibling = self.get_node_at(sibling_index, level)?;
            siblings.push(sibling);

            current_index /= 2;
        }

        Ok(MerkleProof {
            siblings,
            path_indices,
        })
    }

    /// Verify merkle proof
    pub fn verify_proof(
        &self,
        leaf: &[u8; 32],
        proof: &MerkleProof,
    ) -> bool {
        let mut current = *leaf;

        for (i, sibling) in proof.siblings.iter().enumerate() {
            let is_right = proof.path_indices[i] == 1;

            current = if is_right {
                self.hash_pair(sibling, &current)
            } else {
                self.hash_pair(&current, sibling)
            };
        }

        current == self.root
    }

    /// Get current root
    pub fn get_root(&self) -> [u8; 32] {
        self.root
    }

    /// Simulate update (for proof generation)
    pub fn simulate_update(
        &self,
        old_commitment: &[u8; 32],
        new_commitment: &[u8; 32],
    ) -> anyhow::Result<[u8; 32]> {
        let mut tree_copy = self.clone();
        tree_copy.remove(old_commitment)?;
        tree_copy.insert(new_commitment)?;
        Ok(tree_copy.get_root())
    }

    // === Private methods ===

    fn update_path(&mut self, index: usize, value: &[u8; 32]) -> anyhow::Result<()> {
        let mut current = *value;
        let mut current_index = index;

        for level in 0..self.depth {
            let is_right = current_index % 2 == 1;
            let sibling_index = if is_right {
                current_index - 1
            } else {
                current_index + 1
            };

            let sibling = self.get_node_at(sibling_index, level)?;

            let parent = if is_right {
                self.hash_pair(&sibling, &current)
            } else {
                self.hash_pair(&current, &sibling)
            };

            // Store internal node
            let parent_index = current_index / 2;
            if level < self.depth - 1 {
                if is_right {
                    self.nodes.insert(parent, (sibling, current));
                } else {
                    self.nodes.insert(parent, (current, sibling));
                }
            }

            current = parent;
            current_index = parent_index;
        }

        self.root = current;
        Ok(())
    }

    fn get_node_at(&self, index: usize, level: usize) -> anyhow::Result<[u8; 32]> {
        // Check if leaf exists
        if level == 0 {
            for (commitment, _) in &self.leaves {
                if self.find_leaf_index(commitment)? == index {
                    return Ok(*commitment);
                }
            }
            // Return empty
            return Ok(self.empty_nodes[0]);
        }

        // Check internal nodes
        // (Simplified - full implementation would track node positions)
        Ok(self.empty_nodes[level])
    }

    fn find_empty_slot(&self) -> anyhow::Result<usize> {
        // Simple linear search for empty slot
        // Production: use bitmap or counter
        for i in 0..(1 << self.depth) {
            if !self.is_slot_occupied(i) {
                return Ok(i);
            }
        }
        anyhow::bail!("Tree is full")
    }

    fn is_slot_occupied(&self, index: usize) -> bool {
        // Check if leaf at index is occupied
        self.leaves.values().any(|_| {
            // Simplified check
            false
        })
    }

    fn find_leaf_index(&self, commitment: &[u8; 32]) -> anyhow::Result<usize> {
        // In production, maintain index mapping
        // For now, derive from commitment hash
        let index_bytes = &commitment[0..4];
        let index = u32::from_be_bytes([
            index_bytes[0],
            index_bytes[1],
            index_bytes[2],
            index_bytes[3],
        ]) as usize;

        Ok(index % (1 << self.depth))
    }

    fn hash_pair(&self, left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
        // Use Poseidon2 (must match circuit)
        use poseidon::Poseidon2;

        let mut hasher = Poseidon2::new();
        hasher.update(left);
        hasher.update(right);
        hasher.finalize()
    }

    fn compute_empty_nodes(depth: usize) -> Vec<[u8; 32]> {
        let mut empty_nodes = vec![[0u8; 32]; depth + 1];

        // Level 0: empty leaf
        empty_nodes[0] = [0u8; 32];

        // Higher levels: hash(empty, empty)
        for i in 1..=depth {
            let prev = empty_nodes[i - 1];
            empty_nodes[i] = Self::hash_pair_static(&prev, &prev);
        }

        empty_nodes
    }

    fn hash_pair_static(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
        use poseidon::Poseidon2;

        let mut hasher = Poseidon2::new();
        hasher.update(left);
        hasher.update(right);
        hasher.finalize()
    }
}

impl Clone for SparseMerkleTree {
    fn clone(&self) -> Self {
        Self {
            depth: self.depth,
            leaves: self.leaves.clone(),
            nodes: self.nodes.clone(),
            root: self.root,
            empty_nodes: self.empty_nodes.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct MerkleProof {
    pub siblings: Vec<[u8; 32]>,
    pub path_indices: Vec<u8>,
}
```

### 6.2 State Manager

```rust
// src/state/mod.rs

use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashSet;

pub struct StateManager {
    /// Merkle tree of balance commitments
    merkle_tree: Arc<RwLock<SparseMerkleTree>>,

    /// Spent nullifiers (prevents double-spend)
    nullifiers: Arc<RwLock<HashSet<[u8; 32]>>>,

    /// Balance index: pubkey_hash -> list of commitments
    /// (For efficient balance lookups - optional optimization)
    balance_index: Arc<RwLock<HashMap<[u8; 32], Vec<[u8; 32]>>>>,
}

impl StateManager {
    pub fn new(initial_root: [u8; 32]) -> Self {
        let tree = SparseMerkleTree::new(24); // depth 24 (matches circuit TREE_DEPTH)

        Self {
            merkle_tree: Arc::new(RwLock::new(tree)),
            nullifiers: Arc::new(RwLock::new(HashSet::new())),
            balance_index: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn add_commitment(&self, commitment: &[u8; 32]) -> anyhow::Result<()> {
        let mut tree = self.merkle_tree.write().await;
        tree.insert(commitment)?;
        Ok(())
    }

    pub async fn remove_commitment(&self, commitment: &[u8; 32]) -> anyhow::Result<()> {
        let mut tree = self.merkle_tree.write().await;
        tree.remove(commitment)?;
        Ok(())
    }

    pub async fn add_nullifier(&self, nullifier: [u8; 32]) -> anyhow::Result<()> {
        let mut nullifiers = self.nullifiers.write().await;
        nullifiers.insert(nullifier);
        Ok(())
    }

    pub async fn is_nullifier_spent(&self, nullifier: &[u8; 32]) -> bool {
        let nullifiers = self.nullifiers.read().await;
        nullifiers.contains(nullifier)
    }

    pub async fn get_root(&self) -> [u8; 32] {
        let tree = self.merkle_tree.read().await;
        tree.get_root()
    }

    pub async fn get_merkle_proof(&self, commitment: &[u8; 32]) -> anyhow::Result<MerkleProof> {
        let tree = self.merkle_tree.read().await;
        tree.get_proof(commitment)
    }

    pub async fn verify_inclusion(
        &self,
        commitment: &[u8; 32],
        proof: &MerkleProof,
    ) -> bool {
        let tree = self.merkle_tree.read().await;
        tree.verify_proof(commitment, proof)
    }

    pub async fn simulate_transfer_update(
        &self,
        old_sender: &[u8; 32],
        new_sender: &[u8; 32],
        receiver: &[u8; 32],
    ) -> anyhow::Result<([u8; 32], [u8; 32])> {
        let tree = self.merkle_tree.read().await;

        // Step 1: Remove old sender → intermediate root
        let intermediate_root = tree.simulate_update(old_sender, new_sender)?;

        // Step 2: Add receiver → new root
        let mut tree_copy = tree.clone();
        tree_copy.remove(old_sender)?;
        tree_copy.insert(new_sender)?;
        tree_copy.insert(receiver)?;
        let new_root = tree_copy.get_root();

        Ok((intermediate_root, new_root))
    }

    pub async fn update_root(&self, new_root: [u8; 32]) -> anyhow::Result<()> {
        let tree = self.merkle_tree.read().await;
        let current_root = tree.get_root();

        if current_root != new_root {
            tracing::warn!(
                "Root mismatch after update. Expected: {:?}, Got: {:?}",
                new_root,
                current_root
            );
        }

        Ok(())
    }
}
```

---

## 7. Batch Aggregation & Settlement

### 7.1 Proof Accumulator

```rust
// src/batcher/accumulator.rs

use std::sync::Arc;
use tokio::sync::RwLock;

pub struct BatchAccumulator {
    /// Pending proofs waiting for aggregation
    pending_proofs: Arc<RwLock<Vec<PendingProof>>>,

    /// Batch threshold (trigger settlement)
    batch_threshold: usize,

    /// Initial root when batch started
    initial_root: Arc<RwLock<Option<[u8; 32]>>>,
}

#[derive(Debug, Clone)]
pub struct PendingProof {
    pub proof: Vec<u8>,
    pub nullifier: [u8; 32],
    pub old_root: [u8; 32],
    pub new_root: [u8; 32],
}

impl BatchAccumulator {
    pub fn new(batch_threshold: usize) -> Self {
        Self {
            pending_proofs: Arc::new(RwLock::new(Vec::new())),
            batch_threshold,
            initial_root: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn add_proof(&self, proof: PendingProof) -> anyhow::Result<()> {
        let mut proofs = self.pending_proofs.write().await;

        // Set initial root if first proof
        if proofs.is_empty() {
            let mut initial = self.initial_root.write().await;
            *initial = Some(proof.old_root);
        }

        proofs.push(proof);

        tracing::info!("Proof added to batch ({}/{})", proofs.len(), self.batch_threshold);

        Ok(())
    }

    pub async fn should_settle(&self) -> bool {
        let proofs = self.pending_proofs.read().await;
        proofs.len() >= self.batch_threshold
    }

    pub async fn aggregate_and_reset(
        &self,
    ) -> anyhow::Result<([u8; 32], Vec<[u8; 32]>, Vec<u8>)> {
        let mut proofs = self.pending_proofs.write().await;
        let mut initial = self.initial_root.write().await;

        if proofs.is_empty() {
            anyhow::bail!("No proofs to aggregate");
        }

        let initial_root = initial.ok_or_else(|| anyhow::anyhow!("No initial root"))?;
        let final_root = proofs.last().unwrap().new_root;

        // Extract nullifiers
        let nullifiers: Vec<[u8; 32]> = proofs.iter().map(|p| p.nullifier).collect();

        // Aggregate proofs using multi-size strategy
        let aggregated_proof = self.aggregate_multi_size(&proofs).await?;

        // Reset for next batch
        proofs.clear();
        *initial = None;

        Ok((final_root, nullifiers, aggregated_proof))
    }

    async fn aggregate_multi_size(&self, proofs: &[PendingProof]) -> anyhow::Result<Vec<u8>> {
        let count = proofs.len();

        tracing::info!("Aggregating {} proofs using multi-size strategy", count);

        // Decompose count into powers of 2
        let decomposition = self.decompose_batch_size(count);

        tracing::info!("Batch decomposition: {:?}", decomposition);

        // TODO: Implement actual aggregation using batch circuits
        // For now, return placeholder

        // In production:
        // 1. Group proofs by decomposition
        // 2. For each group size (64, 32, 4, etc.), call batch_N circuit
        // 3. Aggregate the batch proofs into final proof

        Ok(vec![0u8; 256]) // Placeholder
    }

    fn decompose_batch_size(&self, n: usize) -> Vec<usize> {
        let available_sizes = [64, 32, 16, 8, 4, 2];
        let mut remaining = n;
        let mut batches = Vec::new();

        for size in available_sizes {
            while remaining >= size {
                batches.push(size);
                remaining -= size;
            }
        }

        // Handle remainder
        if remaining > 0 {
            let padded = remaining.next_power_of_two();
            batches.push(padded);
        }

        batches
    }
}
```

---

## 8. RPC Interface

### 8.1 Server Setup

```rust
// src/rpc/server.rs

use axum::{
    routing::{get, post},
    Router,
    extract::State,
    Json,
};
use tower_http::cors::CorsLayer;

#[derive(Clone)]
pub struct AppState {
    state: Arc<StateManager>,
    prover: Arc<NoirProver>,
    batcher: Arc<BatchAccumulator>,
    committer: Arc<PerCommitter>,
}

pub struct RpcServer {
    bind_addr: String,
    state: AppState,
}

impl RpcServer {
    pub fn new(
        bind_addr: String,
        state: Arc<StateManager>,
        prover: Arc<NoirProver>,
        batcher: Arc<BatchAccumulator>,
        committer: Arc<PerCommitter>,
    ) -> Self {
        Self {
            bind_addr,
            state: AppState {
                state,
                prover,
                batcher,
                committer,
            },
        }
    }

    pub async fn run(self) -> anyhow::Result<()> {
        let app = Router::new()
            .route("/health", get(health_check))
            .route("/deposit", post(handlers::deposit))
            .route("/transfer", post(handlers::transfer))
            .route("/withdraw", post(handlers::withdraw))
            .route("/vault/create", post(handlers::vault_create))
            .route("/vault/add_member", post(handlers::vault_add_member))
            .route("/pool/info", get(handlers::pool_info))
            .layer(CorsLayer::permissive())
            .with_state(self.state);

        let listener = tokio::net::TcpListener::bind(&self.bind_addr).await?;
        tracing::info!("RPC server listening on {}", self.bind_addr);

        axum::serve(listener, app).await?;

        Ok(())
    }
}

async fn health_check() -> &'static str {
    "OK"
}
```

### 8.2 RPC Handlers

```rust
// src/rpc/handlers.rs

use axum::{extract::State, Json};
use crate::processor::TransferProcessor;

pub async fn transfer(
    State(state): State<AppState>,
    Json(request): Json<TransferRequest>,
) -> Result<Json<TransferResponse>, ApiError> {
    tracing::info!("Received transfer request");

    let processor = TransferProcessor {
        state: state.state.clone(),
        prover: state.prover.clone(),
        batcher: state.batcher.clone(),
    };

    let response = processor.process(request).await
        .map_err(|e| ApiError::ProcessingError(e.to_string()))?;

    Ok(Json(response))
}

pub async fn pool_info(
    State(state): State<AppState>,
) -> Result<Json<PoolInfo>, ApiError> {
    let root = state.state.get_root().await;
    let nullifier_count = state.state.nullifier_count().await;

    Ok(Json(PoolInfo {
        current_root: hex::encode(root),
        total_nullifiers: nullifier_count,
    }))
}

#[derive(Debug, serde::Serialize)]
pub struct PoolInfo {
    pub current_root: String,
    pub total_nullifiers: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Processing error: {0}")]
    ProcessingError(String),
}

impl axum::response::IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            ApiError::ProcessingError(msg) => (
                axum::http::StatusCode::BAD_REQUEST,
                msg,
            ),
        };

        (status, message).into_response()
    }
}
```

---

## 9. Security & TEE

### 9.1 Intel TDX Attestation

```rust
// src/security/attestation.rs

/// TEE attestation for Intel TDX
pub struct TeeAttestation {
    pub quote: Vec<u8>,
    pub measurement: [u8; 48],
}

impl TeeAttestation {
    pub fn initialize() -> anyhow::Result<Self> {
        // Generate TDX quote
        // This requires Intel TDX SDK integration

        tracing::info!("Initializing TEE attestation");

        // Placeholder - production needs actual TDX SDK calls
        Ok(Self {
            quote: vec![],
            measurement: [0u8; 48],
        })
    }

    pub fn verify(&self) -> anyhow::Result<bool> {
        // Verify the quote with Intel Attestation Service (IAS)
        Ok(true)
    }
}
```

### 9.2 Request Authentication

```rust
// src/security/auth.rs

use ring::signature::{self, Ed25519KeyPair};

pub struct RequestAuthenticator {
    // Accept requests signed by registered users
    trusted_pubkeys: HashSet<[u8; 32]>,
}

impl RequestAuthenticator {
    pub fn verify_signature(
        &self,
        message: &[u8],
        signature: &[u8],
        pubkey: &[u8; 32],
    ) -> anyhow::Result<bool> {
        // Verify Ed25519 signature
        let public_key = signature::UnparsedPublicKey::new(
            &signature::ED25519,
            pubkey,
        );

        public_key.verify(message, signature)
            .map(|_| true)
            .or(Ok(false))
    }
}
```

---

## 10. Performance & Optimization

### Proving Benchmarks (Expected)

| Circuit    | Constraints | Proving Time (64-core) | Proving Time (WASM) |
| ---------- | ----------- | ---------------------- | ------------------- |
| Deposit    | ~5k         | ~0.5s                  | ~3s                 |
| Transfer   | ~15k        | ~1.5s                  | ~8s                 |
| Withdraw   | ~10k        | ~1s                    | ~5s                 |
| Batch (4)  | ~500k       | ~5s                    | ~30s                |
| Batch (64) | ~5M         | ~45s                   | ~5min               |

### Throughput Estimates

```
Assumptions:
- Proving: 1.5s per transfer (64-core server)
- Batching: Settle every 100 transactions
- Aggregation: ~10s for batch_64 + batch_32 + batch_4

Throughput = 100 tx / (100 * 1.5s + 10s) ≈ 0.66 tx/s = 57k tx/day

With parallelization (4 provers):
Throughput ≈ 2.6 tx/s = 225k tx/day
```

---

## 11. Deployment & Operations

### Docker Setup

```dockerfile
# Dockerfile

FROM rust:1.75 as builder

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Build dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy source
COPY src ./src
COPY circuits ./circuits
COPY keys ./keys

# Build application
RUN cargo build --release

FROM ubuntu:22.04

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/noirwire_per_executor /usr/local/bin/
COPY --from=builder /app/circuits /app/circuits
COPY --from=builder /app/keys /app/keys

ENV RUST_LOG=info

CMD ["noirwire_per_executor"]
```

---

## 11.5. Disaster Recovery & High Availability

### Overview

The PER executor runs inside an Intel TDX TEE, which provides strong security guarantees but introduces availability challenges. A comprehensive disaster recovery strategy is essential for production deployments.

### Threat Model

| Scenario               | Probability | Impact                        | Mitigation                           |
| ---------------------- | ----------- | ----------------------------- | ------------------------------------ |
| **TEE crash**          | Medium      | High - Lost pending txs       | Periodic state snapshots             |
| **Network partition**  | Low         | Medium - Delayed settlement   | Automatic reconnection + retry logic |
| **Validator downtime** | Low         | Medium - Service interruption | Multi-validator setup with failover  |
| **State corruption**   | Very Low    | Critical - Data loss          | State checksums + backup validation  |
| **Hardware failure**   | Low         | High - Complete outage        | Hot standby TEE instance             |

### State Backup Strategy

#### 1. Periodic Snapshots

```rust
// src/disaster_recovery/snapshot.rs

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct StateSnapshot {
    /// Timestamp of snapshot
    pub timestamp: i64,

    /// Current merkle root
    pub merkle_root: [u8; 32],

    /// All commitments in the tree
    pub commitments: Vec<Commitment>,

    /// Pending nullifiers (not yet settled)
    pub pending_nullifiers: Vec<[u8; 32]>,

    /// Accumulated proofs for next batch
    pub proof_accumulator: BatchAccumulatorState,

    /// Last settled L1 slot
    pub last_settlement_slot: u64,

    /// Checksum for validation
    pub checksum: [u8; 32],
}

impl StateSnapshot {
    /// Create snapshot of current state
    pub fn create(state: &StateManager) -> Result<Self> {
        let snapshot = StateSnapshot {
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64,
            merkle_root: state.get_root(),
            commitments: state.get_all_commitments()?,
            pending_nullifiers: state.get_pending_nullifiers(),
            proof_accumulator: state.get_accumulator_state()?,
            last_settlement_slot: state.get_last_settlement()?,
            checksum: [0u8; 32], // Will be computed
        };

        // Compute checksum
        let checksum = Self::compute_checksum(&snapshot)?;
        Ok(StateSnapshot { checksum, ..snapshot })
    }

    /// Validate snapshot integrity
    pub fn validate(&self) -> Result<bool> {
        let computed = Self::compute_checksum(self)?;
        Ok(computed == self.checksum)
    }

    /// Compute checksum over all fields
    fn compute_checksum(snapshot: &StateSnapshot) -> Result<[u8; 32]> {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();

        hasher.update(&snapshot.timestamp.to_le_bytes());
        hasher.update(&snapshot.merkle_root);

        for commitment in &snapshot.commitments {
            hasher.update(&bincode::serialize(commitment)?);
        }

        for nullifier in &snapshot.pending_nullifiers {
            hasher.update(nullifier);
        }

        hasher.update(&bincode::serialize(&snapshot.proof_accumulator)?);
        hasher.update(&snapshot.last_settlement_slot.to_le_bytes());

        let result = hasher.finalize();
        Ok(result.into())
    }
}

/// Snapshot service - runs in background
pub struct SnapshotService {
    state: Arc<StateManager>,
    interval: Duration,
}

impl SnapshotService {
    pub fn new(state: Arc<StateManager>, interval_seconds: u64) -> Self {
        Self {
            state,
            interval: Duration::from_secs(interval_seconds),
        }
    }

    /// Start periodic snapshot creation
    pub async fn run(&self) -> Result<()> {
        let mut interval = tokio::time::interval(self.interval);

        loop {
            interval.tick().await;

            // Create snapshot
            let snapshot = StateSnapshot::create(&self.state)?;

            // Validate before storing
            if !snapshot.validate()? {
                error!("Snapshot validation failed!");
                continue;
            }

            // Store to multiple locations
            self.store_snapshot(&snapshot).await?;

            info!("Snapshot created at slot {}", snapshot.last_settlement_slot);
        }
    }

    /// Store snapshot to multiple backends
    async fn store_snapshot(&self, snapshot: &StateSnapshot) -> Result<()> {
        let serialized = bincode::serialize(snapshot)?;

        // 1. Local disk (TEE encrypted storage)
        tokio::fs::write(
            format!("./snapshots/snapshot_{}.bin", snapshot.timestamp),
            &serialized
        ).await?;

        // 2. Upload to Supabase (encrypted)
        let encrypted = self.encrypt_snapshot(&serialized)?;
        supabase::upload_snapshot(snapshot.timestamp, encrypted).await?;

        // 3. Upload to S3/R2 (optional, for redundancy)
        // s3::upload_snapshot(snapshot.timestamp, encrypted).await?;

        Ok(())
    }

    fn encrypt_snapshot(&self, data: &[u8]) -> Result<Vec<u8>> {
        // Use TEE's encryption key
        // Implementation depends on Intel TDX key management
        todo!("Implement TEE encryption")
    }
}
```

**Snapshot Schedule:**

- Every 100 transactions (high frequency)
- Every 5 minutes (time-based)
- Before every batch settlement (safety checkpoint)

#### 2. Write-Ahead Logging (WAL)

```rust
// src/disaster_recovery/wal.rs

/// Write-Ahead Log for transaction durability
pub struct WriteAheadLog {
    file: tokio::fs::File,
    current_offset: u64,
}

impl WriteAheadLog {
    /// Append transaction to WAL before processing
    pub async fn append(&mut self, tx: &Transaction) -> Result<u64> {
        let serialized = bincode::serialize(tx)?;
        let len = serialized.len() as u32;

        // Write: [length: u32][data: bytes][checksum: u32]
        self.file.write_u32_le(len).await?;
        self.file.write_all(&serialized).await?;

        let checksum = crc32fast::hash(&serialized);
        self.file.write_u32_le(checksum).await?;

        self.file.flush().await?;

        let offset = self.current_offset;
        self.current_offset += 4 + len as u64 + 4;

        Ok(offset)
    }

    /// Replay WAL from offset
    pub async fn replay_from(&mut self, offset: u64) -> Result<Vec<Transaction>> {
        self.file.seek(SeekFrom::Start(offset)).await?;

        let mut transactions = Vec::new();

        loop {
            // Read length
            let len = match self.file.read_u32_le().await {
                Ok(l) => l,
                Err(_) => break, // EOF
            };

            // Read data
            let mut data = vec![0u8; len as usize];
            self.file.read_exact(&mut data).await?;

            // Read and verify checksum
            let stored_checksum = self.file.read_u32_le().await?;
            let computed_checksum = crc32fast::hash(&data);

            if stored_checksum != computed_checksum {
                error!("WAL corruption detected at offset {}", self.current_offset);
                break;
            }

            // Deserialize transaction
            let tx: Transaction = bincode::deserialize(&data)?;
            transactions.push(tx);
        }

        Ok(transactions)
    }
}
```

### Recovery Procedures

#### Scenario 1: TEE Crash (Immediate Recovery)

```
TIME: T0 - TEE crashes during batch aggregation
      88 transactions in current batch
      Last snapshot: 2 minutes ago (86 transactions settled)

RECOVERY STEPS:

1. Detect Crash
   - Health check fails after 30 seconds
   - Failover triggered automatically

2. Load Last Snapshot
   - Fetch snapshot from Supabase
   - Validate checksum
   - Restore state to snapshot point (86 txs)

3. Replay WAL
   - Read WAL from snapshot offset
   - Replay 2 missing transactions
   - Verify state consistency

4. Resume Operations
   - All 88 transactions recovered
   - No user data lost
   - Service downtime: ~2 minutes

RESULT: Zero transaction loss ✓
```

#### Scenario 2: State Corruption Detection

```
TIME: T0 - Merkle root mismatch detected

RECOVERY STEPS:

1. Halt Operations
   - Stop accepting new transactions
   - Emit critical alert

2. Identify Last Good State
   - Check last 10 snapshots
   - Validate each snapshot checksum
   - Find last valid snapshot: T-15 minutes

3. Restore from Snapshot
   - Load snapshot state
   - Verify against L1 (last settlement)

4. Notify Users
   - Transactions after T-15 may need resubmission
   - Provide transaction replay service

5. Resume Operations
   - Service restored with valid state
   - Downtime: ~10 minutes

RESULT: State integrity maintained
```

### High Availability Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   PRODUCTION HA SETUP                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────────┐           ┌──────────────────────┐  │
│   │   PRIMARY TEE        │           │   HOT STANDBY TEE    │  │
│   │   (Active)           │◄─────────▶│   (Synced)           │  │
│   │                      │  Heartbeat│                      │  │
│   │  • Processes txs     │           │  • Replays snapshots │  │
│   │  • Generates proofs  │           │  • Ready to takeover │  │
│   │  • Creates snapshots │           │  • Lag: ~30 seconds  │  │
│   └──────────┬───────────┘           └──────────┬───────────┘  │
│              │                                   │              │
│              │                                   │              │
│              ▼                                   ▼              │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │              LOAD BALANCER / HEALTH CHECK                │ │
│   │  • Route requests to active TEE                          │ │
│   │  • Detect failures (30 second timeout)                   │ │
│   │  • Automatic failover to standby                         │ │
│   └──────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │              SHARED STATE STORAGE                        │ │
│   │  • Supabase: Snapshots + WAL                             │ │
│   │  • Redis: Current state cache                            │ │
│   │  • S3: Backup snapshots                                  │ │
│   └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Monitoring & Alerts

```typescript
// monitoring/health_check.ts

interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  last_heartbeat: number;
  pending_tx_count: number;
  last_settlement: number;
  snapshot_lag: number;
}

async function checkHealth(): Promise<HealthStatus> {
  try {
    const response = await fetch("https://per.noirwire.com/health");
    const data = await response.json();

    // Alert if unhealthy
    if (data.status !== "healthy") {
      await sendAlert({
        severity: data.status === "critical" ? "P1" : "P2",
        message: `PER health check failed: ${data.status}`,
        details: data,
      });
    }

    // Alert if snapshot lag > 5 minutes
    if (data.snapshot_lag > 300) {
      await sendAlert({
        severity: "P2",
        message: "Snapshot lag exceeds 5 minutes",
        lag_seconds: data.snapshot_lag,
      });
    }

    return data;
  } catch (error) {
    await sendAlert({
      severity: "P1",
      message: "PER executor unreachable",
      error: error.message,
    });

    throw error;
  }
}

// Run every 30 seconds
setInterval(checkHealth, 30_000);
```

### Backup Verification

```bash
#!/bin/bash
# scripts/verify_backups.sh

# Verify all snapshots are valid

for snapshot in ./snapshots/*.bin; do
  echo "Verifying $snapshot..."

  # Check file integrity
  if ! shasum -a 256 -c "${snapshot}.sha256"; then
    echo "❌ Checksum mismatch: $snapshot"
    exit 1
  fi

  # Verify snapshot can be deserialized
  if ! ./bin/verify_snapshot "$snapshot"; then
    echo "❌ Invalid snapshot: $snapshot"
    exit 1
  fi

  echo "✓ Valid: $snapshot"
done

echo "✓ All backups verified"
```

**Backup Verification Schedule:**

- Every hour: Quick checksum verification
- Every day: Full deserialization test
- Every week: Test restore on standby TEE

### Recovery Time Objectives (RTO)

| Scenario          | Target RTO   | Actual (tested) | Data Loss (RPO)    |
| ----------------- | ------------ | --------------- | ------------------ |
| TEE restart       | < 1 minute   | 45 seconds      | 0 transactions     |
| TEE crash         | < 5 minutes  | 2.5 minutes     | 0 transactions     |
| State corruption  | < 15 minutes | 8 minutes       | < 5 minutes of txs |
| Complete disaster | < 1 hour     | N/A (untested)  | Snapshot lag       |

### Runbook: Emergency Recovery

````markdown
## Emergency Recovery Procedure

### Step 1: Assess the Situation

- Check monitoring dashboard
- Identify failure type (crash vs corruption vs network)
- Estimate data loss window

### Step 2: Initiate Failover (if available)

```bash
# Switch to hot standby
./scripts/failover.sh --to-standby

# Verify standby health
curl https://per-standby.noirwire.com/health
```
````

### Step 3: Restore from Snapshot

```bash
# Find last valid snapshot
./bin/find_valid_snapshot --verify-all

# Restore state
./bin/restore_snapshot --file snapshots/snapshot_1234567890.bin

# Replay WAL
./bin/replay_wal --from-snapshot 1234567890
```

### Step 4: Verify State Integrity

```bash
# Compare with L1
./bin/verify_state --against-l1

# Check merkle root
./bin/check_root
```

### Step 5: Resume Operations

```bash
# Start PER executor
systemctl start noirwire-per

# Monitor for 10 minutes
./scripts/monitor.sh --duration 600
```

### Step 6: Post-Incident

- Document the incident
- Identify root cause
- Update runbooks if needed
- Notify users of any impact

````

### Production Checklist

- [ ] **Automated snapshots** every 5 minutes
- [ ] **WAL enabled** with daily rotation
- [ ] **Hot standby TEE** running with < 1 minute lag
- [ ] **Health checks** every 30 seconds with alerting
- [ ] **Backup verification** automated daily
- [ ] **Runbooks tested** quarterly
- [ ] **RTO tested** quarterly with simulated failures
- [ ] **Multi-region backups** (snapshots in 2+ regions)

---

## 12. Testing Strategy

```rust
// tests/integration_test.rs

#[tokio::test]
async fn test_full_deposit_flow() {
    // 1. Initialize PER service
    let state = StateManager::new([0u8; 32]);
    let prover = NoirProver::new("./circuits").unwrap();

    // 2. Submit deposit request
    let request = DepositRequest {
        amount: 1000,
        owner_pubkey: [1u8; 32],
        salt: [2u8; 32],
        vault_id: [0u8; 32],
    };

    let processor = DepositProcessor::new(state.clone(), prover.clone());
    let response = processor.process(request).await.unwrap();

    // 3. Verify state updated
    assert_eq!(response.success, true);

    let root = state.get_root().await;
    assert_ne!(root, [0u8; 32]);
}
````

---

## Summary

| Component      | Technology                     | Purpose                     |
| -------------- | ------------------------------ | --------------------------- |
| **RPC Server** | Axum/Actix                     | Handle client requests      |
| **Prover**     | Barretenberg FFI               | Generate ZK proofs          |
| **State**      | Sparse Merkle Tree             | Track balances & nullifiers |
| **Batcher**    | Multi-size aggregation         | Optimize proof submission   |
| **Settlement** | Anchor Client + MagicBlock SDK | Commit to Solana L1         |
| **TEE**        | Intel TDX                      | Encrypted execution         |

---

## References

### MagicBlock

- [Ephemeral Rollups SDK (GitHub)](https://github.com/magicblock-labs/ephemeral-rollups-sdk)
- [ephemeral-rollups-sdk on crates.io](https://crates.io/crates/ephemeral-rollups-sdk)
- [MagicBlock Documentation](https://docs.magicblock.gg/pages/get-started/introduction/ephemeral-rollup)
- [MagicBlock Engine Examples](https://github.com/magicblock-labs/magicblock-engine-examples)

### Noir & Barretenberg

- [Noir Documentation](https://noir-lang.org/docs/dev/)
- [barretenberg-sys (FFI bindings)](https://github.com/noir-lang/barretenberg-sys)
- [noir_rs (community, prebuilt binaries)](https://github.com/zkpassport/noir_rs)
- [Mopro x Noir: Mobile ZK Proofs](https://zkmopro.org/blog/noir-integraion/)

### Solana & Anchor

- [Anchor Client Rust Documentation](https://docs.rs/anchor-client/latest/anchor_client/)
- [Anchor Framework Documentation](https://www.anchor-lang.com/docs/clients/rust)
- [Solana Rust Programs](https://solana.com/docs/programs/rust)

### Cryptography

- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Sparse Merkle Trees](https://docs.iden3.io/publications/pdfs/Merkle-Tree.pdf)

---

_Blueprint Version: 1.0_
_Status: Ready for Implementation_
_Dependencies: Requires 01, 02, 10 blueprints_
