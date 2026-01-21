# 10 — Solana Programs Architecture

## Overview

This blueprint defines the **Solana on-chain programs** for the Noirwire private payment system. These programs handle deposits, withdrawals, state commitments, and ZK proof verification.

> **Reference:** See [01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md) for the ZK circuits these programs verify.
>
> **Important:** This document aligns with MagicBlock SDK v0.8.1 and Anchor 0.32.1 (or 1.0.0-rc.2 for early adopters)

---

## Table of Contents

1. [Program Architecture](#1-program-architecture)
2. [Account Structures](#2-account-structures)
3. [Shielded Pool Program](#3-shielded-pool-program)
4. [ZK Verifier Program](#4-zk-verifier-program)
5. [Vault Registry Program](#5-vault-registry-program)
6. [PER Integration](#6-per-integration)
7. [Cross-Program Invocations](#7-cross-program-invocations)
8. [Security Considerations](#8-security-considerations)

---

## 1. Program Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SOLANA L1 PROGRAMS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐                    │
│  │   SHIELDED POOL     │    │    ZK VERIFIER      │                    │
│  │      PROGRAM        │───▶│      PROGRAM        │                    │
│  │                     │    │                     │                    │
│  │  • Deposits         │    │  • Groth16 verify   │                    │
│  │  • Withdrawals      │    │  • alt_bn128 pairing│                    │
│  │  • State roots      │    │  • Proof validation │                    │
│  │  • Nullifier set    │    │                     │                    │
│  └──────────┬──────────┘    └─────────────────────┘                    │
│             │                                                           │
│             │ CPI                                                       │
│             ▼                                                           │
│  ┌─────────────────────┐    ┌─────────────────────┐                    │
│  │   VAULT REGISTRY    │    │   TOKEN PROGRAM     │                    │
│  │      PROGRAM        │    │   (SPL Token)       │                    │
│  │                     │    │                     │                    │
│  │  • Vault creation   │    │  • Token transfers  │                    │
│  │  • Member roots     │    │  • Mint/burn        │                    │
│  │  • Vault metadata   │    │                     │                    │
│  └─────────────────────┘    └─────────────────────┘                    │
│                                                                         │
│  ════════════════════════════════════════════════════════════════════  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PER INTEGRATION LAYER                        │   │
│  │                                                                 │   │
│  │   MagicBlock Ephemeral Rollup Programs:                        │   │
│  │   • Delegation Program (account delegation to PER)             │   │
│  │   • Permission Program (access control)                        │   │
│  │   • Commit/Undelegate (settlement back to L1)                  │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Program IDs

```rust
// Program IDs - will be generated on deployment
pub mod program_ids {
    use solana_program::declare_id;

    // Noirwire Programs (placeholder - generated on deploy)
    declare_id!("NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"); // Shielded Pool
    declare_id!("NwireVrfyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"); // ZK Verifier
    declare_id!("NwireVau1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"); // Vault Registry
}

// MagicBlock External Programs (from official docs)
pub mod magicblock {
    use solana_program::declare_id;

    // Delegation Program - handles account delegation to ER
    declare_id!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

    // Permission Program - handles access control for PER
    declare_id!("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
}

// ER Validator Endpoints (from MagicBlock docs)
pub mod validators {
    // Development validators
    pub const ASIA: &str = "MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57";
    pub const EU: &str = "MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e";
    pub const US: &str = "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd";
    pub const TEE: &str = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"; // For PER
    pub const LOCAL: &str = "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev";
}
```

---

## 2. Account Structures

### 2.1 Pool State Account

The main state account for the shielded pool:

```rust
// accounts/pool_state.rs

use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct PoolState {
    /// Authority that can upgrade the pool (multisig recommended)
    pub authority: Pubkey,

    /// Current merkle root of all commitments
    pub commitment_root: [u8; 32],

    /// Historical roots (for delayed spending - keeps last N roots valid)
    pub historical_roots: [[u8; 32]; 32],  // Ring buffer of 32 roots
    pub roots_index: u8,

    /// Total shielded balance (for accounting, public info)
    pub total_shielded: u64,

    /// Supported token mint
    pub token_mint: Pubkey,

    /// Pool's token vault (holds all shielded tokens)
    pub token_vault: Pubkey,

    /// Verification key hash (ensures correct circuit)
    pub vk_hash: [u8; 32],

    /// Pause flag for emergencies
    pub paused: bool,

    /// Stats
    pub total_deposits: u64,
    pub total_withdrawals: u64,
    pub total_nullifiers: u64,

    /// Bump seed for PDA
    pub bump: u8,

    /// Reserved for future upgrades
    pub _reserved: [u8; 256],
}

impl PoolState {
    pub const SIZE: usize = 8 +  // discriminator
        32 +                      // authority
        32 +                      // commitment_root
        (32 * 32) +              // historical_roots
        1 +                       // roots_index
        8 +                       // total_shielded
        32 +                      // token_mint
        32 +                      // token_vault
        32 +                      // vk_hash
        1 +                       // paused
        8 + 8 + 8 +              // stats
        1 +                       // bump
        256;                      // reserved

    /// Check if a root is valid (current or in history)
    pub fn is_valid_root(&self, root: &[u8; 32]) -> bool {
        if self.commitment_root == *root {
            return true;
        }
        self.historical_roots.iter().any(|r| r == root)
    }

    /// Update root (push current to history)
    pub fn update_root(&mut self, new_root: [u8; 32]) {
        self.historical_roots[self.roots_index as usize] = self.commitment_root;
        self.roots_index = (self.roots_index + 1) % 32;
        self.commitment_root = new_root;
    }
}
```

### 2.2 Nullifier Account

Nullifiers are stored in a separate account structure for efficient lookups:

```rust
// accounts/nullifier_set.rs

use anchor_lang::prelude::*;

/// Individual nullifier entry (PDA per nullifier)
#[account]
pub struct NullifierEntry {
    /// The nullifier hash
    pub nullifier: [u8; 32],

    /// Block when this nullifier was added (for analytics)
    pub slot: u64,

    /// Bump seed
    pub bump: u8,
}

impl NullifierEntry {
    pub const SIZE: usize = 8 + 32 + 8 + 1;

    /// PDA seeds: ["nullifier", pool_pubkey, nullifier_hash]
    pub fn seeds<'a>(pool: &'a Pubkey, nullifier: &'a [u8; 32]) -> [&'a [u8]; 3] {
        [b"nullifier", pool.as_ref(), nullifier]
    }
}

/// Batch nullifier submission (for PER settlement)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct NullifierBatch {
    pub nullifiers: Vec<[u8; 32]>,
}
```

### 2.3 Verification Key Account

Stores the Groth16 verification key:

```rust
// accounts/verification_key.rs

use anchor_lang::prelude::*;

#[account]
pub struct VerificationKey {
    /// Pool this VK belongs to
    pub pool: Pubkey,

    /// Circuit identifier (e.g., "transfer", "batch_64")
    pub circuit_id: [u8; 32],

    /// Alpha G1 point (64 bytes - compressed)
    pub alpha_g1: [u8; 64],

    /// Beta G2 point (128 bytes - compressed)
    pub beta_g2: [u8; 128],

    /// Gamma G2 point (128 bytes)
    pub gamma_g2: [u8; 128],

    /// Delta G2 point (128 bytes)
    pub delta_g2: [u8; 128],

    /// IC (input commitments) - variable length
    /// Each IC point is 64 bytes (G1 compressed)
    pub ic_length: u8,
    pub ic: Vec<[u8; 64]>,

    /// Bump seed
    pub bump: u8,
}

impl VerificationKey {
    pub fn size(ic_count: usize) -> usize {
        8 +         // discriminator
        32 +        // pool
        32 +        // circuit_id
        64 +        // alpha_g1
        128 +       // beta_g2
        128 +       // gamma_g2
        128 +       // delta_g2
        1 +         // ic_length
        4 + (ic_count * 64) +  // ic vector
        1           // bump
    }
}
```

### 2.4 Vault Account

```rust
// accounts/vault.rs

use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    /// Unique vault identifier (hash)
    pub vault_id: [u8; 32],

    /// Merkle root of vault members
    pub members_root: [u8; 32],

    /// Number of members
    pub member_count: u32,

    /// Vault creator (can update members_root)
    pub admin: Pubkey,

    /// Vault metadata (encrypted, only members can decrypt)
    pub encrypted_metadata: [u8; 128],

    /// Creation timestamp
    pub created_at: i64,

    /// Vault type (0 = standard, 1 = multisig, etc.)
    pub vault_type: u8,

    /// Required signatures for multisig vaults
    pub threshold: u8,

    /// Bump seed
    pub bump: u8,
}

impl Vault {
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 32 + 128 + 8 + 1 + 1 + 1;
}
```

---

## 3. Shielded Pool Program

### 3.1 Program Structure

```rust
// programs/shielded_pool/src/lib.rs

use anchor_lang::prelude::*;

declare_id!("NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

pub mod instructions;
pub mod state;
pub mod errors;
pub mod events;

use instructions::*;

#[program]
pub mod shielded_pool {
    use super::*;

    /// Initialize a new shielded pool
    pub fn initialize(
        ctx: Context<Initialize>,
        token_mint: Pubkey,
        vk_hash: [u8; 32],
    ) -> Result<()> {
        instructions::initialize::handler(ctx, token_mint, vk_hash)
    }

    /// Deposit tokens into the shielded pool (shield)
    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        commitment: [u8; 32],
        proof: ProofData,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, amount, commitment, proof)
    }

    /// Withdraw tokens from the shielded pool (unshield)
    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount: u64,
        nullifier: [u8; 32],
        recipient: Pubkey,
        proof: ProofData,
    ) -> Result<()> {
        instructions::withdraw::handler(ctx, amount, nullifier, recipient, proof)
    }

    /// Batch settlement from PER (multiple nullifiers + new root)
    pub fn settle_batch(
        ctx: Context<SettleBatch>,
        new_root: [u8; 32],
        nullifiers: Vec<[u8; 32]>,
        proof: ProofData,
    ) -> Result<()> {
        instructions::settle_batch::handler(ctx, new_root, nullifiers, proof)
    }

    /// Update verification key (admin only)
    pub fn update_vk(
        ctx: Context<UpdateVk>,
        circuit_id: [u8; 32],
        vk_data: VerificationKeyData,
    ) -> Result<()> {
        instructions::update_vk::handler(ctx, circuit_id, vk_data)
    }

    /// Emergency pause (admin only)
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }
}
```

### 3.2 Deposit Instruction

```rust
// instructions/deposit.rs

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::errors::PoolError;
use crate::events::DepositEvent;

#[derive(Accounts)]
#[instruction(amount: u64, commitment: [u8; 32])]
pub struct Deposit<'info> {
    /// Pool state account
    #[account(
        mut,
        seeds = [b"pool", token_mint.key().as_ref()],
        bump = pool.bump,
        constraint = !pool.paused @ PoolError::PoolPaused
    )]
    pub pool: Account<'info, PoolState>,

    /// User's token account (source)
    #[account(
        mut,
        constraint = user_token_account.mint == pool.token_mint @ PoolError::InvalidMint
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Pool's token vault (destination)
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// Token mint
    pub token_mint: Account<'info, token::Mint>,

    /// Depositor (signer)
    #[account(mut)]
    pub depositor: Signer<'info>,

    /// ZK Verifier program
    pub verifier_program: Program<'info, ZkVerifier>,

    /// Verification key account
    #[account(
        seeds = [b"vk", pool.key().as_ref(), b"deposit"],
        bump
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// SPL Token program
    pub token_program: Program<'info, Token>,

    /// System program
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Deposit>,
    amount: u64,
    commitment: [u8; 32],
    proof: ProofData,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // 1. Prepare public inputs for proof verification
    //    [amount, commitment, new_root]
    let public_inputs = vec![
        field_from_u64(amount),
        commitment,
        proof.new_root,
    ];

    // 2. Verify ZK proof via CPI to verifier program
    let cpi_ctx = CpiContext::new(
        ctx.accounts.verifier_program.to_account_info(),
        VerifyProof {
            verification_key: ctx.accounts.verification_key.to_account_info(),
        },
    );
    zk_verifier::cpi::verify(cpi_ctx, proof.proof_data, public_inputs)?;

    // 3. Transfer tokens from user to pool vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // 4. Update pool state
    pool.update_root(proof.new_root);
    pool.total_shielded = pool.total_shielded.checked_add(amount)
        .ok_or(PoolError::Overflow)?;
    pool.total_deposits += 1;

    // 5. Emit event
    emit!(DepositEvent {
        pool: pool.key(),
        commitment,
        amount,
        new_root: proof.new_root,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Convert u64 to field element bytes
fn field_from_u64(val: u64) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    bytes[24..32].copy_from_slice(&val.to_be_bytes());
    bytes
}
```

### 3.3 Withdraw Instruction

```rust
// instructions/withdraw.rs

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::errors::PoolError;
use crate::events::WithdrawEvent;

#[derive(Accounts)]
#[instruction(amount: u64, nullifier: [u8; 32])]
pub struct Withdraw<'info> {
    /// Pool state
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.paused @ PoolError::PoolPaused
    )]
    pub pool: Account<'info, PoolState>,

    /// Pool's token vault
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// Recipient's token account
    #[account(
        mut,
        constraint = recipient_token_account.mint == pool.token_mint @ PoolError::InvalidMint
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// Nullifier PDA (created to mark as spent)
    #[account(
        init,
        payer = payer,
        space = NullifierEntry::SIZE,
        seeds = [b"nullifier", pool.key().as_ref(), &nullifier],
        bump
    )]
    pub nullifier_entry: Account<'info, NullifierEntry>,

    /// Verification key
    #[account(
        seeds = [b"vk", pool.key().as_ref(), b"withdraw"],
        bump
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// ZK Verifier program
    pub verifier_program: Program<'info, ZkVerifier>,

    /// Payer for nullifier account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Pool authority PDA (for signing vault transfers)
    /// CHECK: PDA verified by seeds
    #[account(
        seeds = [b"authority", pool.key().as_ref()],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Withdraw>,
    amount: u64,
    nullifier: [u8; 32],
    recipient: Pubkey,
    proof: ProofData,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // 1. Verify the merkle root used in proof is valid
    require!(
        pool.is_valid_root(&proof.old_root),
        PoolError::InvalidMerkleRoot
    );

    // 2. Public inputs: [nullifier, amount, recipient, old_root, new_root]
    let public_inputs = vec![
        nullifier,
        field_from_u64(amount),
        recipient_to_field(&recipient),
        proof.old_root,
        proof.new_root,
    ];

    // 3. Verify ZK proof
    let cpi_ctx = CpiContext::new(
        ctx.accounts.verifier_program.to_account_info(),
        VerifyProof {
            verification_key: ctx.accounts.verification_key.to_account_info(),
        },
    );
    zk_verifier::cpi::verify(cpi_ctx, proof.proof_data, public_inputs)?;

    // 4. Record nullifier (account creation proves uniqueness)
    let nullifier_entry = &mut ctx.accounts.nullifier_entry;
    nullifier_entry.nullifier = nullifier;
    nullifier_entry.slot = Clock::get()?.slot;
    nullifier_entry.bump = ctx.bumps.nullifier_entry;

    // 5. Transfer tokens from pool to recipient
    let pool_key = pool.key();
    let authority_seeds = &[
        b"authority",
        pool_key.as_ref(),
        &[ctx.bumps.pool_authority],
    ];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.pool_vault.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.pool_authority.to_account_info(),
        },
        &[authority_seeds],
    );
    token::transfer(transfer_ctx, amount)?;

    // 6. Update pool state
    pool.update_root(proof.new_root);
    pool.total_shielded = pool.total_shielded.checked_sub(amount)
        .ok_or(PoolError::Underflow)?;
    pool.total_withdrawals += 1;
    pool.total_nullifiers += 1;

    // 7. Emit event
    emit!(WithdrawEvent {
        pool: pool.key(),
        nullifier,
        amount,
        recipient,
        new_root: proof.new_root,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn recipient_to_field(pubkey: &Pubkey) -> [u8; 32] {
    pubkey.to_bytes()
}
```

### 3.4 Batch Settlement (from PER)

```rust
// instructions/settle_batch.rs

use anchor_lang::prelude::*;

use crate::state::*;
use crate::errors::PoolError;
use crate::events::BatchSettlementEvent;

#[derive(Accounts)]
pub struct SettleBatch<'info> {
    /// Pool state
    #[account(
        mut,
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump,
        constraint = !pool.paused @ PoolError::PoolPaused
    )]
    pub pool: Account<'info, PoolState>,

    /// PER authority (MagicBlock delegation)
    /// Only the delegated PER can call this
    pub per_authority: Signer<'info>,

    /// Verification key for batch circuit
    #[account(
        seeds = [b"vk", pool.key().as_ref(), b"batch"],
        bump
    )]
    pub verification_key: Account<'info, VerificationKey>,

    /// ZK Verifier program
    pub verifier_program: Program<'info, ZkVerifier>,

    /// Payer for nullifier accounts
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SettleBatch>,
    new_root: [u8; 32],
    nullifiers: Vec<[u8; 32]>,
    proof: ProofData,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    require!(nullifiers.len() <= 256, PoolError::BatchTooLarge);

    // 1. Build public inputs for batch proof
    //    [initial_root, final_root, nullifiers_hash]
    let nullifiers_hash = hash_nullifiers(&nullifiers);
    let public_inputs = vec![
        proof.old_root,
        new_root,
        nullifiers_hash,
    ];

    // 2. Verify batch ZK proof
    let cpi_ctx = CpiContext::new(
        ctx.accounts.verifier_program.to_account_info(),
        VerifyProof {
            verification_key: ctx.accounts.verification_key.to_account_info(),
        },
    );
    zk_verifier::cpi::verify(cpi_ctx, proof.proof_data, public_inputs)?;

    // 3. Record all nullifiers
    //    Note: In production, this would be done via remaining_accounts
    //    to create nullifier PDAs for each nullifier
    for nullifier in &nullifiers {
        // Nullifier PDA creation is handled via remaining_accounts
        // This is a simplified version
        pool.total_nullifiers += 1;
    }

    // 4. Update pool state with new root
    pool.update_root(new_root);

    // 5. Emit event
    emit!(BatchSettlementEvent {
        pool: pool.key(),
        old_root: proof.old_root,
        new_root,
        nullifier_count: nullifiers.len() as u32,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Hash all nullifiers together for compact public input
fn hash_nullifiers(nullifiers: &[[u8; 32]]) -> [u8; 32] {
    use solana_program::keccak;

    let mut hasher_input = Vec::with_capacity(nullifiers.len() * 32);
    for n in nullifiers {
        hasher_input.extend_from_slice(n);
    }
    keccak::hash(&hasher_input).to_bytes()
}
```

---

## 4. ZK Verifier Program

> **Note:** Solana provides `alt_bn128` syscalls for BN254 elliptic curve operations.
> These are the same curve operations used by Ethereum's precompiles.
> Reference: Light Protocol uses this for production ZK on Solana.

### 4.1 Groth16 Verification Overview

Solana's BN254 syscalls (available since v1.16):

- `sol_alt_bn128_group_op` - G1/G2 point operations (add, multiply, negate)
- `sol_alt_bn128_pairing` - Pairing check for Groth16 verification

```rust
// programs/zk_verifier/src/lib.rs

use anchor_lang::prelude::*;
use solana_program::alt_bn128::prelude::*;

declare_id!("NwireVrfyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

pub mod groth16;
pub mod errors;

use groth16::*;

#[program]
pub mod zk_verifier {
    use super::*;

    /// Verify a Groth16 proof
    /// Requires ~200k-400k compute units depending on public inputs
    pub fn verify(
        ctx: Context<VerifyProof>,
        proof: Groth16Proof,
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        let vk = &ctx.accounts.verification_key;

        // Verify proof using alt_bn128 pairing
        let result = groth16::verify_proof(
            &vk.alpha_g1,
            &vk.beta_g2,
            &vk.gamma_g2,
            &vk.delta_g2,
            &vk.ic,
            &proof,
            &public_inputs,
        )?;

        require!(result, errors::VerifierError::InvalidProof);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    /// Verification key account
    pub verification_key: Account<'info, VerificationKey>,
}
```

### 4.2 Groth16 Core Implementation

```rust
// programs/zk_verifier/src/groth16.rs

use anchor_lang::prelude::*;
use solana_program::alt_bn128::{
    AltBn128Error,
    consts::{
        ALT_BN128_ADD, ALT_BN128_MUL, ALT_BN128_PAIRING,
        G1_COMPRESSED, G2_COMPRESSED,
    },
};

/// Groth16 proof structure (BN254 curve)
/// Points are in compressed format
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Groth16Proof {
    /// A point (G1) - 32 bytes compressed
    pub a: [u8; 64],
    /// B point (G2) - 64 bytes compressed
    pub b: [u8; 128],
    /// C point (G1) - 32 bytes compressed
    pub c: [u8; 64],
}

/// Verify a Groth16 proof using Solana's alt_bn128 syscalls
///
/// The verification equation is:
/// e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
///
/// Which we check as:
/// e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
pub fn verify_proof(
    alpha_g1: &[u8; 64],
    beta_g2: &[u8; 128],
    gamma_g2: &[u8; 128],
    delta_g2: &[u8; 128],
    ic: &[[u8; 64]],
    proof: &Groth16Proof,
    public_inputs: &[[u8; 32]],
) -> Result<bool> {
    // 1. Check input count matches IC count
    require!(
        public_inputs.len() + 1 == ic.len(),
        errors::VerifierError::InputCountMismatch
    );

    // 2. Compute vk_x = IC[0] + sum(input[i] * IC[i+1])
    //    This accumulates the public inputs into a single G1 point
    let mut vk_x = ic[0].to_vec();

    for (i, input) in public_inputs.iter().enumerate() {
        // Scalar multiplication: input[i] * IC[i+1]
        let scaled = alt_bn128_multiplication(&ic[i + 1], input)?;
        // Point addition: vk_x += scaled
        vk_x = alt_bn128_addition(&vk_x, &scaled)?;
    }

    // 3. Negate proof.A for pairing check
    let neg_a = negate_g1(&proof.a)?;

    // 4. Build pairing input (4 pairs for Groth16)
    // Verification: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
    let mut pairing_input = Vec::with_capacity(4 * (64 + 128));

    // Pair 1: e(-A, B) - negated proof point A with B
    pairing_input.extend_from_slice(&neg_a);
    pairing_input.extend_from_slice(&proof.b);

    // Pair 2: e(alpha, beta) - from verification key
    pairing_input.extend_from_slice(alpha_g1);
    pairing_input.extend_from_slice(beta_g2);

    // Pair 3: e(vk_x, gamma) - accumulated public inputs with gamma
    pairing_input.extend_from_slice(&vk_x);
    pairing_input.extend_from_slice(gamma_g2);

    // Pair 4: e(C, delta) - proof point C with delta
    pairing_input.extend_from_slice(&proof.c);
    pairing_input.extend_from_slice(delta_g2);

    // 5. Execute pairing check via syscall
    let result = alt_bn128_pairing(&pairing_input)?;

    // Result is 32 bytes: 0x000...001 if pairing check passes
    Ok(result[31] == 1 && result[..31].iter().all(|&b| b == 0))
}

/// Wrapper for alt_bn128 addition syscall
fn alt_bn128_addition(p1: &[u8], p2: &[u8]) -> Result<Vec<u8>> {
    let mut input = Vec::with_capacity(p1.len() + p2.len());
    input.extend_from_slice(p1);
    input.extend_from_slice(p2);

    solana_program::alt_bn128::alt_bn128_addition(&input)
        .map_err(|_| error!(errors::VerifierError::Bn128Error))
}

/// Wrapper for alt_bn128 multiplication syscall
fn alt_bn128_multiplication(point: &[u8], scalar: &[u8; 32]) -> Result<Vec<u8>> {
    let mut input = Vec::with_capacity(point.len() + 32);
    input.extend_from_slice(point);
    input.extend_from_slice(scalar);

    solana_program::alt_bn128::alt_bn128_multiplication(&input)
        .map_err(|_| error!(errors::VerifierError::Bn128Error))
}

/// Wrapper for alt_bn128 pairing syscall
fn alt_bn128_pairing(input: &[u8]) -> Result<Vec<u8>> {
    solana_program::alt_bn128::alt_bn128_pairing(input)
        .map_err(|_| error!(errors::VerifierError::PairingFailed))
}

/// Negate G1 point (flip y-coordinate in Fp)
/// For BN254: -P = (x, p - y) where p is the field modulus
fn negate_g1(point: &[u8; 64]) -> Result<[u8; 64]> {
    // BN254 field modulus p
    const P: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
        0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
    ];

    let mut result = *point;
    // x stays the same (first 32 bytes)
    // y = p - y (second 32 bytes)
    let y = &point[32..64];
    let neg_y = field_sub(&P, y);
    result[32..64].copy_from_slice(&neg_y);

    Ok(result)
}

fn field_sub(a: &[u8; 32], b: &[u8]) -> [u8; 32] {
    // Subtract b from a in the finite field
    // This is simplified - production code needs proper big integer arithmetic
    let mut result = [0u8; 32];
    let mut borrow = 0u16;
    for i in (0..32).rev() {
        let diff = (a[i] as u16) - (b[i] as u16) - borrow;
        result[i] = diff as u8;
        borrow = if diff > 255 { 1 } else { 0 };
    }
    result
}
```

### 4.3 Compute Budget Considerations

````rust
// Groth16 verification costs on Solana (approximate)
// Based on Light Protocol benchmarks

/// CU costs for BN254 operations
pub mod compute_costs {
    pub const BN128_ADD: u32 = 500;       // G1 point addition
    pub const BN128_MUL: u32 = 12_000;    // G1 scalar multiplication
    pub const BN128_PAIRING: u32 = 79_000; // Per pairing (we need 4)
}

/// Total CU for Groth16 verification
/// ~400k-500k CU depending on public input count
pub fn estimate_verify_cu(public_input_count: usize) -> u32 {
    let pairing_cost = 4 * compute_costs::BN128_PAIRING;  // 316k
    let mul_cost = public_input_count as u32 * compute_costs::BN128_MUL;
    let add_cost = public_input_count as u32 * compute_costs::BN128_ADD;
    let overhead = 50_000; // Account loading, serialization, etc.

    pairing_cost + mul_cost + add_cost + overhead
}

// Example: 10 public inputs ≈ 450k CU
// Solana default limit: 200k CU
// Max requestable: 1,400,000 CU

/// Client-side: Request compute budget before verify
/// ```typescript
/// const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
///     units: 500_000,
/// });
/// ```
}
````

---

## 5. Vault Registry Program

```rust
// programs/vault_registry/src/lib.rs

use anchor_lang::prelude::*;

declare_id!("NwireVau1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod vault_registry {
    use super::*;

    /// Create a new vault
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: [u8; 32],
        initial_members_root: [u8; 32],
        encrypted_metadata: [u8; 128],
        vault_type: u8,
        threshold: u8,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        vault.vault_id = vault_id;
        vault.members_root = initial_members_root;
        vault.member_count = 1; // Creator is first member
        vault.admin = ctx.accounts.creator.key();
        vault.encrypted_metadata = encrypted_metadata;
        vault.created_at = Clock::get()?.unix_timestamp;
        vault.vault_type = vault_type;
        vault.threshold = threshold;
        vault.bump = ctx.bumps.vault;

        emit!(VaultCreatedEvent {
            vault_id,
            admin: ctx.accounts.creator.key(),
            vault_type,
        });

        Ok(())
    }

    /// Update vault members root (with ZK proof of valid update)
    pub fn update_members(
        ctx: Context<UpdateMembers>,
        new_members_root: [u8; 32],
        new_member_count: u32,
        proof: MembershipUpdateProof,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        // Verify the membership update proof
        // (proves old members + new member = new root)
        // ... ZK verification ...

        vault.members_root = new_members_root;
        vault.member_count = new_member_count;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(vault_id: [u8; 32])]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = creator,
        space = Vault::SIZE,
        seeds = [b"vault", &vault_id],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMembers<'info> {
    #[account(
        mut,
        seeds = [b"vault", &vault.vault_id],
        bump = vault.bump,
        constraint = vault.admin == admin.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, Vault>,

    pub admin: Signer<'info>,
}
```

---

## 6. PER Integration

> **SDK Version:** This section uses `ephemeral-rollups-sdk` v0.8.x
> See: https://github.com/magicblock-labs/ephemeral-rollups-sdk

### 6.1 Cargo Dependencies

```toml
# Cargo.toml
[dependencies]
# Stable version (recommended for production)
anchor-lang = "0.32.1"
# Or use release candidate for latest features:
# anchor-lang = "1.0.0-rc.2"

ephemeral-rollups-sdk = "0.8.1"

# For PER TEE endpoint
# Endpoint: https://tee.magicblock.app?token={authToken}
```

### 6.2 Program with Delegation Hooks

Based on MagicBlock's official pattern (from their counter example):

```rust
// programs/shielded_pool/src/lib.rs

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::cpi::{delegate_account, undelegate_account, commit_accounts};
use ephemeral_rollups_sdk::consts::DELEGATION_PROGRAM_ID;

// Mark program for ephemeral rollup compatibility
#[ephemeral]
#[program]
pub mod shielded_pool {
    use super::*;

    /// Standard deposit (can be called on Base Layer or ER)
    pub fn deposit(ctx: Context<Deposit>, amount: u64, commitment: [u8; 32]) -> Result<()> {
        // ... deposit logic ...
        Ok(())
    }

    /// Delegate pool state to PER for private execution
    /// Called on BASE LAYER to move account to ER
    pub fn delegate(ctx: Context<DelegatePool>) -> Result<()> {
        // TEE validator for Private Ephemeral Rollups
        let valid_validator = Pubkey::from_str("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA")
            .unwrap();

        delegate_account(
            &ctx.accounts.payer,
            &ctx.accounts.pool,
            &ctx.accounts.owner_program,
            &ctx.accounts.buffer,
            &ctx.accounts.delegation_record,
            &ctx.accounts.delegation_metadata,
            &ctx.accounts.delegation_program,
            &ctx.accounts.system_program,
            // Seeds for PDA signing if needed
            None,
            vec![valid_validator],
            30 * 24 * 60 * 60, // 30 days validity
        )?;

        Ok(())
    }

    /// Commit state changes back to L1 (called on ER)
    /// Does NOT undelegate - account stays on ER
    pub fn commit(ctx: Context<CommitPool>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.pool.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        Ok(())
    }

    /// Commit and undelegate - return account to Base Layer
    pub fn commit_and_undelegate(ctx: Context<CommitPool>) -> Result<()> {
        // First commit the latest state
        commit_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.pool.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        // Then schedule undelegation
        undelegate_account(
            &ctx.accounts.pool,
            &ctx.accounts.owner_program,
            &ctx.accounts.buffer,
            &ctx.accounts.delegation_record,
            &ctx.accounts.delegation_metadata,
            &ctx.accounts.delegation_program,
            &ctx.accounts.system_program,
            None, // seeds
        )?;

        Ok(())
    }

    /// Batch settlement from PER with ZK proof
    pub fn settle_batch(
        ctx: Context<SettleBatch>,
        new_root: [u8; 32],
        nullifiers: Vec<[u8; 32]>,
        proof: ProofData,
    ) -> Result<()> {
        // ... ZK verification and state update ...
        // ... then commit to L1 ...
        Ok(())
    }
}

/// Context for delegating pool to PER
#[derive(Accounts)]
pub struct DelegatePool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Pool account to delegate
    #[account(mut, seeds = [b"pool", pool.token_mint.as_ref()], bump)]
    pub pool: Account<'info, PoolState>,

    /// CHECK: Delegation program accounts
    #[account(mut)]
    pub buffer: AccountInfo<'info>,

    /// CHECK: Delegation record PDA
    #[account(mut)]
    pub delegation_record: AccountInfo<'info>,

    /// CHECK: Delegation metadata
    #[account(mut)]
    pub delegation_metadata: AccountInfo<'info>,

    /// The shielded pool program itself
    pub owner_program: AccountInfo<'info>,

    /// MagicBlock Delegation Program
    #[account(address = DELEGATION_PROGRAM_ID)]
    pub delegation_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
```

### 6.3 PER Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PER LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DELEGATE (Base Layer → ER)                                 │
│     User calls: shielded_pool::delegate()                      │
│     Account owner changes to: DELeGGvXpWV2fqJUhqcF5ZSYMS4JTL.. │
│     Account cloned to TEE at: tee.magicblock.app               │
│                                                                 │
│  2. EXECUTE PRIVATELY (Inside PER TEE)                         │
│     ┌─────────────────────────────────────────────────────┐    │
│     │  Private transfers happen here                       │    │
│     │  - Noir proofs generated inside TEE                  │    │
│     │  - State encrypted, operator can't see               │    │
│     │  - Proofs accumulated for batching                   │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  3. COMMIT (ER → Base Layer periodically)                      │
│     shielded_pool::commit() syncs state                        │
│     Account stays delegated for more transactions              │
│                                                                 │
│  4. UNDELEGATE (Return to Base Layer)                          │
│     shielded_pool::commit_and_undelegate()                     │
│     Account owner reverts to original program                  │
│     Final state committed with ZK batch proof                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 Authorization for PER (TEE Access)

```typescript
// Client-side: Get authorization token for TEE endpoint
import { Connection, Keypair } from "@solana/web3.js";

async function getPerAuthorization(wallet: Keypair): Promise<string> {
  // 1. Request challenge from TEE
  const teeEndpoint = "https://tee.magicblock.app";
  const challengeRes = await fetch(`${teeEndpoint}/challenge`);
  const { challenge } = await challengeRes.json();

  // 2. Sign challenge with wallet
  const signature = await wallet.sign(Buffer.from(challenge));

  // 3. Get auth token
  const authRes = await fetch(`${teeEndpoint}/authorize`, {
    method: "POST",
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      signature: Buffer.from(signature).toString("base64"),
      challenge,
    }),
  });

  const { token } = await authRes.json();
  return token;
}

// Use token in RPC calls
const perConnection = new Connection(
  `https://tee.magicblock.app?token=${authToken}`,
);
```

### 6.5 PER Execution Context (Inside TEE)

```rust
// per_integration/per_execution.rs

/// This runs INSIDE the PER TEE
/// Handles private transactions and proof generation

pub struct PerExecutionContext {
    /// Local merkle tree state
    pub merkle_tree: SparseMerkleTree,

    /// Pending nullifiers (not yet committed to L1)
    pub pending_nullifiers: Vec<[u8; 32]>,

    /// Accumulated proofs for batching
    pub proof_accumulator: BatchProofAccumulator,

    /// Noir prover instance
    pub prover: NoirProver,
}

impl PerExecutionContext {
    /// Process a private transfer (inside TEE)
    pub fn process_transfer(
        &mut self,
        request: PrivateTransferRequest,
    ) -> Result<TransferReceipt> {
        // 1. Validate request
        let sender_balance = self.get_balance(&request.sender_commitment)?;
        require!(sender_balance >= request.amount);

        // 2. Generate ZK proof for this transfer
        let proof = self.prover.prove_transfer(
            &request.private_inputs,
            &self.merkle_tree,
        )?;

        // 3. Update local state
        let nullifier = self.compute_nullifier(&request);
        self.pending_nullifiers.push(nullifier);

        self.merkle_tree.remove(&request.sender_commitment);
        self.merkle_tree.insert(&request.new_sender_commitment);
        self.merkle_tree.insert(&request.receiver_commitment);

        // 4. Accumulate proof for batch
        self.proof_accumulator.add_proof(proof)?;

        Ok(TransferReceipt {
            nullifier,
            new_root: self.merkle_tree.root(),
        })
    }

    /// Trigger batch settlement to L1
    pub fn settle_batch(&mut self) -> Result<BatchSettlement> {
        // 1. Aggregate all accumulated proofs
        let batch_proof = self.proof_accumulator.aggregate()?;

        // 2. Prepare settlement data
        let settlement = BatchSettlement {
            old_root: self.proof_accumulator.initial_root(),
            new_root: self.merkle_tree.root(),
            nullifiers: std::mem::take(&mut self.pending_nullifiers),
            proof: batch_proof,
        };

        // 3. Reset accumulator
        self.proof_accumulator.reset(self.merkle_tree.root());

        Ok(settlement)
    }
}
```

### 6.3 Settlement Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PER SETTLEMENT FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ACCUMULATE (Inside PER TEE)                                │
│     ├── TX 1 → proof → accumulate                              │
│     ├── TX 2 → proof → accumulate                              │
│     ├── ...                                                    │
│     └── TX N → proof → accumulate                              │
│                                                                 │
│  2. AGGREGATE (Inside PER TEE)                                 │
│     └── batch_64 + batch_32 + ... → single proof               │
│                                                                 │
│  3. UNDELEGATE (Commit to L1)                                  │
│     ├── Submit aggregated proof                                │
│     ├── Submit new merkle root                                 │
│     └── Submit nullifier batch                                 │
│                                                                 │
│  4. VERIFY (Solana L1)                                         │
│     ├── ZK Verifier: check proof validity                      │
│     ├── Shielded Pool: create nullifier PDAs                   │
│     └── Shielded Pool: update state root                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Cross-Program Invocations

### CPI Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CPI ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User/PER                                                      │
│       │                                                         │
│       ▼                                                         │
│   ┌─────────────────────┐                                      │
│   │   Shielded Pool     │                                      │
│   │      Program        │                                      │
│   └─────────┬───────────┘                                      │
│             │                                                   │
│      ┌──────┼──────┬──────────────┐                           │
│      │      │      │              │                            │
│      ▼      ▼      ▼              ▼                            │
│   ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐                 │
│   │  ZK  │ │ SPL  │ │  Vault   │ │ MagicBlock│                │
│   │Verify│ │Token │ │ Registry │ │Delegation │                │
│   └──────┘ └──────┘ └──────────┘ └──────────┘                 │
│                                                                 │
│   CPI Calls:                                                   │
│   • verify() → ZK Verifier                                     │
│   • transfer() → SPL Token                                     │
│   • check_membership() → Vault Registry                        │
│   • undelegate() → MagicBlock                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Security Considerations

### 8.1 Attack Vectors & Mitigations

| Attack                        | Mitigation                                      |
| ----------------------------- | ----------------------------------------------- |
| **Double-spend**              | Nullifier PDA uniqueness (init fails if exists) |
| **Fake proof**                | ZK verification via alt_bn128 pairing           |
| **State manipulation**        | Historical roots buffer for async spending      |
| **Front-running**             | Encrypted inputs, commitment scheme             |
| **Griefing (nullifier spam)** | Rent cost for nullifier PDAs                    |
| **VK substitution**           | VK hash stored in pool, verified on use         |

### 8.2 Access Control

```rust
// Access control matrix

pub enum Role {
    Admin,      // Pool authority - can pause, update VK
    PER,        // Delegated PER - can batch settle
    User,       // Anyone - can deposit, withdraw (with valid proof)
}

pub fn check_access(role: Role, action: Action) -> bool {
    match (role, action) {
        (Role::Admin, _) => true,
        (Role::PER, Action::SettleBatch) => true,
        (Role::User, Action::Deposit) => true,
        (Role::User, Action::Withdraw) => true,  // With valid ZK proof
        _ => false,
    }
}
```

### 8.3 Emergency Procedures

```rust
// Emergency pause
pub fn emergency_pause(ctx: Context<AdminAction>) -> Result<()> {
    require!(
        ctx.accounts.pool.authority == ctx.accounts.admin.key(),
        PoolError::Unauthorized
    );
    ctx.accounts.pool.paused = true;
    emit!(EmergencyPauseEvent { ... });
    Ok(())
}

// Timelock for critical changes (recommended)
pub struct Timelock {
    pub proposed_action: ProposedAction,
    pub proposed_at: i64,
    pub execution_delay: i64,  // e.g., 24 hours
}
```

---

## Summary

| Program             | Purpose                    | Key Instructions                |
| ------------------- | -------------------------- | ------------------------------- |
| **Shielded Pool**   | Main state management      | deposit, withdraw, settle_batch |
| **ZK Verifier**     | Groth16 proof verification | verify                          |
| **Vault Registry**  | Vault membership           | create_vault, update_members    |
| **PER Integration** | MagicBlock delegation      | delegate, undelegate            |

### Account Sizes

| Account         | Size (bytes) | Rent (SOL) |
| --------------- | ------------ | ---------- |
| PoolState       | ~1,400       | ~0.01      |
| NullifierEntry  | 49           | ~0.001     |
| VerificationKey | ~1,000+      | ~0.007     |
| Vault           | ~250         | ~0.002     |

---

## Next Steps

1. **[04_Client_SDK.md](04_Client_SDK.md)** — TypeScript SDK for interacting with programs
2. **[05_Testing_Strategy.md](05_Testing_Strategy.md)** — Unit tests, integration tests, fuzzing

---

## References

### Solana

- [Solana Programs Documentation](https://solana.com/docs/core/programs)
- [Solana Precompiled Programs](https://solana.com/docs/core/programs#precompiled-programs) — includes alt_bn128 info
- [Anchor Framework](https://www.anchor-lang.com/docs)
- [SPL Token Program](https://spl.solana.com/token)
- [Compute Budget](https://solana.com/docs/core/fees#compute-budget) — for requesting CU

### MagicBlock

- [PER Quickstart](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart)
- [ER Delegation Guide](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/quickstart)
- [Delegation Lifecycle](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/ephemeral-rollup)
- [Ephemeral Rollups SDK](https://github.com/magicblock-labs/ephemeral-rollups-sdk) — v0.8.x
- [MagicBlock Engine Examples](https://github.com/magicblock-labs/magicblock-engine-examples)

### ZK References

- [Light Protocol](https://github.com/Lightprotocol/light-protocol) — Production ZK on Solana
- [ZK Compression](https://www.zkcompression.com/) — Light Protocol docs
- [Groth16 on Solana](https://github.com/Lightprotocol/light-protocol/tree/main/programs) — Reference implementation

---

_Blueprint Version: 1.0_
_Compatible with: Anchor 0.32.1 / 1.0.0-rc.2, MagicBlock SDK 0.8.1, Solana 2.x_
_Status: Ready for Implementation_
