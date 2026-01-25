# Noirwire Solana Programs - Security Audit Report

**Audit Date:** January 25, 2026
**Auditor:** Claude Sonnet 4.5 (Security Architecture Expert)
**Programs Reviewed:** shielded-pool, zk-verifier, vault-registry
**Blueprint Versions:** 10_Solana_Programs.md v2.0, 11_Vault_Program.md v2.0

---

## Executive Summary

The Noirwire Solana programs implement a privacy-preserving payment system with ZK proof verification and vault management. The audit identified **8 CRITICAL**, **12 HIGH**, **15 MEDIUM**, and **8 LOW** priority issues requiring remediation before production deployment.

### Overall Security Rating: ⚠️ **REQUIRES SIGNIFICANT IMPROVEMENTS**

### Critical Blockers

1. **ZK verification is completely non-functional** (stubbed alt_bn128 syscalls)
2. **Batch settlement lacks proof verification** (allows arbitrary state manipulation)
3. **Missing nullifier recording mechanism**
4. **Insufficient access control** on critical operations
5. **Historical roots buffer 112x too small** (8 vs 900 slots)

### Recommendation

**🚫 DO NOT DEPLOY** until all CRITICAL and HIGH priority issues are resolved and a professional third-party audit is completed.

**Estimated Timeline to Production:** 11-16 weeks minimum

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Priority Issues](#high-priority-issues)
3. [Medium Priority Issues](#medium-priority-issues)
4. [Low Priority Issues](#low-priority-issues)
5. [Blueprint Compliance](#blueprint-compliance)
6. [Remediation Roadmap](#remediation-roadmap)
7. [Testing Recommendations](#testing-recommendations)
8. [Deployment Checklist](#deployment-checklist)

---

## Critical Issues

### 🔴 CRITICAL-01: ZK Verification Not Implemented

**Location:** `/programs/zk-verifier/src/groth16.rs:93-166`

**Issue:** All `alt_bn128` syscalls return errors. Proof verification is completely non-functional.

```rust
fn alt_bn128_addition(p1: &[u8], p2: &[u8]) -> Result<Vec<u8>> {
    // TODO: Replace with actual syscall when available
    err!(VerifierError::Bn128Error)  // ⚠️ Always fails
}
```

**Impact:** Zero cryptographic security - any "proof" will fail. Protocol cannot operate as designed.

**Remediation:**
```toml
# Use Light Protocol's verified implementation
[dependencies]
light-verifier = "0.3.0"
```

---

### 🔴 CRITICAL-02: Historical Roots Buffer Severely Undersized

**Location:** `/programs/shielded-pool/src/state/pool_state.rs:9`

**Issue:** Buffer is 8 instead of 900 (blueprint specification).

```rust
pub const HISTORICAL_ROOTS_SIZE: usize = 8;  // Blueprint specifies 900!
```

**Impact:**
- Spending window: **3.2 seconds** (vs. 6 minutes)
- Users have only 3.2 seconds to submit withdrawal proofs
- Network congestion will brick the system

**Remediation (Short-term):**
```rust
pub const HISTORICAL_ROOTS_SIZE: usize = 100;  // ~40 seconds minimum
```

**Remediation (Production):**
```rust
// Separate PDA for historical roots
#[account]
pub struct HistoricalRoots {
    pub pool: Pubkey,
    pub roots: [[u8; 32]; 900],  // 28.8KB
    pub index: u16,
}
```

---

### 🔴 CRITICAL-03: Batch Settlement Missing Proof Verification

**Location:** `/programs/shielded-pool/src/instructions/settle_batch.rs:33-37`

**Issue:** No ZK proof verification in `settle_batch` handler.

```rust
// TODO: Verify batch ZK proof  ⚠️ Missing verification!
pool.last_nullifiers_root = nullifiers_root;  // ⚠️ Blindly trusted
pool.update_root(new_root);  // ⚠️ No validation
```

**Impact:**
- **Critical security bypass:** Attacker can submit arbitrary roots
- **Double-spend attacks:** Can create fake nullifiers_root
- **Total loss of funds:** Entire pool can be drained

**Remediation:**
```rust
pub fn settle_batch(
    ctx: Context<SettleBatch>,
    new_root: [u8; 32],
    nullifiers_root: [u8; 32],
    nullifier_count: u32,
    proof: BatchSettlementProofData,  // Add this
) -> Result<()> {
    // Verify batch ZK proof via CPI
    let verify_cpi_ctx = CpiContext::new(
        ctx.accounts.verifier_program.to_account_info(),
        VerifyProof {
            verification_key: ctx.accounts.verification_key.to_account_info(),
        },
    );

    cpi::verify(verify_cpi_ctx, proof.proof, proof.public_inputs())?;

    // Only update state after successful verification
    pool.last_nullifiers_root = nullifiers_root;
    pool.update_root(new_root);
}
```

---

### 🔴 CRITICAL-04: Missing `record_nullifier` Instruction

**Location:** Not implemented (specified in blueprint)

**Issue:** No implementation for recording individual nullifiers after batch settlement.

**Impact:**
- Incomplete batch settlement flow
- **Double-spend vulnerability:** Without nullifier PDAs, same commitment can be withdrawn multiple times
- Critical security mechanism missing

**Remediation:**
```rust
pub fn record_nullifier(
    ctx: Context<RecordNullifier>,
    nullifier: [u8; 32],
    nullifiers_root: [u8; 32],
    merkle_proof: Vec<[u8; 32]>,
) -> Result<()> {
    let pool = &ctx.accounts.pool;

    // Verify nullifiers_root matches last batch
    require!(
        pool.last_nullifiers_root == nullifiers_root,
        PoolError::InvalidNullifierProof
    );

    // Verify nullifier is in nullifiers_root using merkle proof
    let computed_root = compute_merkle_root(&nullifier, &merkle_proof);
    require!(
        computed_root == nullifiers_root,
        PoolError::InvalidNullifierProof
    );

    // Create nullifier PDA (init ensures uniqueness)
    let nullifier_entry = &mut ctx.accounts.nullifier_entry;
    nullifier_entry.nullifier = nullifier;
    nullifier_entry.slot = Clock::get()?.slot;

    Ok(())
}
```

---

### 🔴 CRITICAL-05: No Access Control on Batch Settlement

**Location:** `/programs/shielded-pool/src/instructions/settle_batch.rs:19-20`

**Issue:** `per_authority` signer is not validated.

```rust
pub per_authority: Signer<'info>,  // ⚠️ No constraint validating this!
```

**Impact:**
- **Anyone can call settle_batch** and manipulate pool state
- Combined with CRITICAL-03, allows total pool drainage

**Remediation:**
```rust
#[derive(Accounts)]
pub struct SettleBatch<'info> {
    #[account(
        mut,
        constraint = pool.per_authority == per_authority.key() @ PoolError::Unauthorized
    )]
    pub pool: Account<'info, PoolState>,

    pub per_authority: Signer<'info>,
}
```

---

### 🔴 CRITICAL-06: Missing Deposit Amount Validation

**Location:** `/programs/shielded-pool/src/instructions/deposit.rs:99`

**Issue:** No check that tokens were actually transferred.

```rust
token::transfer(transfer_ctx, amount)?;

pool.total_shielded = pool
    .total_shielded
    .checked_add(amount)  // ⚠️ Trusted blindly
    .ok_or(PoolError::Overflow)?;
```

**Impact:**
- **Pool insolvency:** Can create commitments without backing tokens

**Remediation:**
```rust
// Before transfer
let vault_balance_before = ctx.accounts.pool_vault.amount;

// Transfer tokens
token::transfer(transfer_ctx, amount)?;

// Reload account to get updated balance
ctx.accounts.pool_vault.reload()?;

// Verify actual transfer
let vault_balance_after = ctx.accounts.pool_vault.amount;
let actual_transferred = vault_balance_after
    .checked_sub(vault_balance_before)
    .ok_or(PoolError::Underflow)?;

require!(
    actual_transferred == amount,
    PoolError::InvalidTransferAmount
);
```

---

### 🔴 CRITICAL-07: Withdrawal Missing Balance Check

**Location:** `/programs/shielded-pool/src/instructions/withdraw.rs:134-142`

**Issue:** No validation that pool has sufficient balance.

```rust
token::transfer(transfer_ctx, amount)?;

pool.total_shielded = pool
    .total_shielded
    .checked_sub(amount)  // ⚠️ Can underflow if pool insolvent
    .ok_or(PoolError::Underflow)?;
```

**Remediation:**
```rust
// Before transfer: verify pool has sufficient balance
require!(
    pool.total_shielded >= amount,
    PoolError::InsufficientPoolBalance
);

require!(
    ctx.accounts.pool_vault.amount >= amount,
    PoolError::InsufficientVaultBalance
);

// Transfer tokens
token::transfer(transfer_ctx, amount)?;
```

---

### 🔴 CRITICAL-08: No Permissionless VK Storage Protection

**Location:** `/programs/zk-verifier/src/lib.rs:43-62`

**Issue:** Anyone can store verification keys for any pool.

```rust
pub fn store_vk(
    ctx: Context<StoreVk>,
    circuit_id: [u8; 32],
    vk_data: VerificationKeyData,
) -> Result<()> {
    vk.pool = ctx.accounts.pool.key();  // ⚠️ No authorization check
}
```

**Impact:**
- **VK substitution attack:** Attacker replaces legitimate VK with malicious one
- **Fund drainage:** Can install VK that accepts invalid proofs

**Remediation:**
```rust
#[derive(Accounts)]
pub struct StoreVk<'info> {
    #[account(
        init,
        payer = authority,
        space = VerificationKey::size(16),
        seeds = [b"vk", pool.key().as_ref(), &circuit_id],
        bump
    )]
    pub verification_key: Account<'info, VerificationKey>,

    #[account(
        constraint = pool.authority == authority.key() @ VerifierError::Unauthorized
    )]
    pub pool: Account<'info, PoolState>,

    #[account(mut)]
    pub authority: Signer<'info>,
}
```

---

## High Priority Issues

### 🟠 HIGH-01: Missing PER Integration

**Location:** Multiple files (PER SDK disabled)

**Issue:** PER integration completely absent.

```toml
# ephemeral-rollups-sdk = "0.8.2"  # Temporarily disabled
```

**Impact:**
- Cannot execute private transactions in TEE
- Front-running protection missing
- Core privacy feature non-functional

**Remediation:**
1. Resolve version conflicts
2. Implement delegation instructions
3. Add TEE authorization

---

### 🟠 HIGH-02: Missing Withdrawal Root Validation

**Location:** `/programs/shielded-pool/src/instructions/withdraw.rs:92-94`

**Issue:** No validation that `old_root` in proof is recent enough.

**Impact:**
- **Root expiration attacks:** Users can hold onto old proofs indefinitely

**Remediation:**
```rust
const MAX_ROOT_AGE_SLOTS: u64 = 900;  // ~6 minutes
require!(
    pool.is_valid_root_with_expiration(
        &proof_data.old_root,
        Clock::get()?.slot,
        MAX_ROOT_AGE_SLOTS
    ),
    PoolError::RootTooOld
);
```

---

### 🟠 HIGH-03: Vault Registry Missing PER Permission Program CPI

**Location:** `/programs/vault-registry/src/lib.rs:29-31, 54-55, 77-78`

**Issue:** TODOs for PER Permission Program integration not implemented.

```rust
// TODO: CPI to PER Permission Program to create group
vault.permission_group = vault_id; // Placeholder
```

**Impact:**
- Vault membership not enforced in PER TEE
- Role-based permissions non-functional

**Remediation:**
```rust
use per_permission_program::cpi::{create_group, add_member, remove_member};

pub fn create_vault(...) -> Result<()> {
    // CPI to PER Permission Program
    let cpi_ctx = CpiContext::new(
        ctx.accounts.per_permission_program.to_account_info(),
        CreateGroup { ... },
    );
    create_group(cpi_ctx, vault_id)?;
}
```

---

### 🟠 HIGH-04: Missing Circuit ID Validation

**Issue:** Circuit ID uses compile-time constant that may not match actual VK.

**Remediation:**
```rust
pub struct PoolState {
    pub deposit_circuit_id: [u8; 32],
    pub withdraw_circuit_id: [u8; 32],
    // Store circuit IDs in pool state
}
```

---

### 🟠 HIGH-05: Missing Update VK Instruction

**Issue:** No way to update verification keys after deployment.

**Remediation:**
```rust
pub fn update_vk(
    ctx: Context<UpdateVk>,
    circuit_id: [u8; 32],
    new_vk_data: VerificationKeyData,
) -> Result<()> {
    // Only pool authority can update
    let vk = &mut ctx.accounts.verification_key;
    vk.alpha_g1 = new_vk_data.alpha_g1;
    vk.beta_g2 = new_vk_data.beta_g2;
    // ...
}
```

---

### 🟠 HIGH-06: Missing Compute Budget Instructions

**Issue:** ZK verification requires ~600k CU but default is 200k.

**Remediation (Client-side):**
```typescript
import { ComputeBudgetProgram } from '@solana/web3.js';

const depositTx = await program.methods
    .deposit(amount, proofData)
    .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
    ])
    .rpc();
```

---

### 🟠 HIGH-07: Field to u64 Conversion Vulnerability

**Location:** `/programs/shielded-pool/src/state/proof.rs:176-201`

**Issue:** Field conversion doesn't check for malicious encoding.

**Remediation:**
```rust
pub fn field_to_u64(field: &[u8; 32]) -> Result<u64> {
    // Check leading bytes
    if field[..24].iter().any(|&b| b != 0) {
        return err!(PoolError::InvalidProof);
    }

    // Parse and verify
    let value = u64::from_be_bytes(field[24..32].try_into().unwrap());
    let expected_field = u64_to_field(value);

    require!(
        field == &expected_field,
        PoolError::InvalidProof
    );

    Ok(value)
}
```

---

### 🟠 HIGH-08 through HIGH-12

See full audit report for details on:
- Missing rent exemption checks
- Missing events for critical operations
- Missing pausable constraint on batch settlement
- Nullifier PDA cleanup not implemented
- Missing withdrawal recipient validation

---

## Medium Priority Issues

### 🟡 MEDIUM-01: Historical Roots Not Pruned

**Issue:** Circular buffer doesn't clear overwritten slots.

**Remediation:**
```rust
pub fn update_root(&mut self, new_root: [u8; 32]) {
    self.historical_roots[self.roots_index as usize] = self.commitment_root;
    let next_index = (self.roots_index + 1) % (HISTORICAL_ROOTS_SIZE as u8);

    // Clear slot about to be overwritten
    self.historical_roots[next_index as usize] = [0u8; 32];

    self.roots_index = next_index;
    self.commitment_root = new_root;
}
```

---

### 🟡 MEDIUM-02 through MEDIUM-15

See full audit report for details on:
- Account discriminator validation
- Overflow protection in statistics
- Error messages
- Token mint validation
- Test coverage gaps
- Pool state invariants
- VK hash validation
- Rate limiting
- Vault name sanitization
- Vault deletion
- Emergency withdrawal
- Bump seed storage
- Version fields
- Reserved space

---

## Low Priority Issues

### 🔵 LOW-01 through LOW-08

See full audit report for details on:
- Missing documentation comments
- Inconsistent naming conventions
- Magic numbers in code
- Unused dependencies
- Logging for debugging
- Benchmarking data
- Test fixtures duplication
- CI/CD integration

---

## Blueprint Compliance

### ✅ Implemented Features

| Feature | Status |
|---------|--------|
| Pool initialization | ✅ Complete |
| Nullifier PDA | ✅ Complete |
| Pause mechanism | ✅ Complete |
| Verification key storage | ✅ Complete |
| Vault creation | ⚠️ Missing PER CPI |

### ❌ Missing Features

| Feature | Priority |
|---------|----------|
| ZK proof verification | CRITICAL |
| Batch proof verification | CRITICAL |
| `record_nullifier` | CRITICAL |
| PER delegation | HIGH |
| `update_vk` instruction | HIGH |
| Nullifier cleanup | HIGH |
| Emergency withdrawal | MEDIUM |

### ⚠️ Critical Deviations

1. **Historical Roots Size:** 8 vs 900 (CRITICAL)
2. **Batch Settlement:** No proof verification (CRITICAL)
3. **Access Control:** No PER authority validation (CRITICAL)
4. **VK Storage:** Permissionless vs. pool-authority-gated (HIGH)

---

## Remediation Roadmap

### Phase 1: Critical Blockers (2-3 weeks)

**Before ANY deployment:**

1. ✅ Implement alt_bn128 syscalls (use Light Protocol)
2. ✅ Add batch settlement proof verification
3. ✅ Implement `record_nullifier` instruction
4. ✅ Add PER authority access control
5. ✅ Validate deposit amounts match transfers
6. ✅ Add withdrawal balance checks
7. ✅ Implement pool-authority-gated VK storage
8. ✅ Increase historical roots to 100+ minimum

**Estimated Effort:** 2-3 weeks (1 senior Rust/Solana developer)

### Phase 2: Production Hardening (3-4 weeks)

1. Integrate PER SDK (ephemeral-rollups-sdk)
2. Add root expiration validation
3. Implement PER Permission Program CPIs
4. Add circuit ID validation
5. Implement `update_vk` instruction
6. Document compute budget requirements
7. Fix field to u64 conversion
8. Add rent exemption assertions
9. Implement comprehensive events
10. Verify pause constraints
11. Implement nullifier cleanup

**Estimated Effort:** 3-4 weeks

### Phase 3: Quality & Maintenance (2-3 weeks)

1. Address all MEDIUM priority issues
2. Address all LOW priority issues
3. Comprehensive security test suite
4. Professional third-party audit

**Estimated Effort:** 2-3 weeks

### Phase 4: Professional Audit (4-6 weeks)

1. Hire third-party auditor (OtterSec, Neodyme, Zellic)
2. Address audit findings
3. Bug bounty program
4. Final security review

**Total Timeline:** 11-16 weeks minimum

---

## Testing Recommendations

### Required Security Test Scenarios

```typescript
describe("Security: Critical Attack Vectors", () => {
    it("prevents double-spend with duplicate nullifier");
    it("rejects proof with tampered public inputs");
    it("blocks unauthorized batch settlement");
    it("prevents VK substitution by non-admin");
    it("rejects deposits without token transfer");
    it("prevents withdrawal exceeding pool balance");
    it("enforces historical root expiration");
    it("validates nullifier merkle proof correctness");
});

describe("Security: Economic Attacks", () => {
    it("prevents inflation via fake batch settlement");
    it("blocks withdrawal of non-existent commitments");
    it("prevents root manipulation attacks");
    it("enforces minimum deposit to prevent spam");
});

describe("Security: Access Control", () => {
    it("only admin can pause pool");
    it("only admin can update VK");
    it("only PER authority can settle batch");
    it("only vault admin can manage members");
});

describe("Security: State Consistency", () => {
    it("maintains total_shielded == vault_balance invariant");
    it("prevents root index overflow");
    it("ensures nullifier uniqueness");
    it("validates all account owners");
});
```

### Fuzzing Recommendations

```bash
cargo install cargo-fuzz
cargo fuzz run deposit_fuzz
cargo fuzz run withdraw_fuzz
cargo fuzz run batch_settlement_fuzz
```

Target inputs:
- Proof data (random bytes)
- Public inputs (boundary values, overflow)
- Nullifiers (collisions, duplicates)
- Amounts (0, u64::MAX, mid-range)

---

## Deployment Checklist

Before mainnet deployment:

**Critical (Must Complete):**
- [ ] All CRITICAL issues resolved
- [ ] All HIGH issues resolved
- [ ] Third-party security audit completed
- [ ] Bug bounty program established
- [ ] Emergency pause mechanism tested
- [ ] Multisig for admin authority configured

**Important (Should Complete):**
- [ ] MEDIUM issues risk-assessed and addressed/accepted
- [ ] Comprehensive test suite passing (>95% coverage)
- [ ] Fuzz testing completed (1M+ iterations)
- [ ] Compute budget requirements documented
- [ ] Historical roots buffer properly sized
- [ ] Nullifier cleanup mechanism active

**Nice to Have:**
- [ ] Monitoring and alerting deployed
- [ ] Incident response plan documented
- [ ] User documentation complete
- [ ] Developer SDK documentation complete

---

## Positive Aspects

1. **Good PDA Design:** Deterministic derivation, proper seeds
2. **Checked Arithmetic:** Most operations use `checked_add/checked_sub`
3. **Comprehensive Tests:** 95+ tests covering many scenarios
4. **Blueprint Alignment:** Architecture follows specification closely
5. **Error Handling:** Custom error types defined
6. **Code Organization:** Clean module structure

---

## Final Recommendation

### 🚫 **DO NOT DEPLOY TO PRODUCTION**

The system has a solid architectural foundation but **critical security gaps prevent production deployment**:

1. **ZK verification is non-functional** - Core security mechanism broken
2. **Batch settlement allows arbitrary state manipulation** - Fund drainage risk
3. **Historical roots buffer too small** - System unusable
4. **Missing access controls** - Unauthorized operations possible

### Timeline to Production Readiness

- **Minimum:** 11 weeks (if all goes smoothly)
- **Realistic:** 14-16 weeks (with testing iterations)
- **Safe:** 16-20 weeks (including audit response time)

### Next Steps

1. **Immediate:** Fix all 8 CRITICAL issues (Phase 1)
2. **Week 3-6:** Address HIGH priority issues (Phase 2)
3. **Week 7-9:** Quality improvements and testing (Phase 3)
4. **Week 10-16:** Professional audit and remediation (Phase 4)

### Budget Recommendations

- **Internal Development:** 2-3 senior Solana/Rust developers for 3 months
- **Third-Party Audit:** $50,000-$150,000 (depending on auditor)
- **Bug Bounty:** $100,000+ (initial pool)
- **Total Estimated Cost:** $200,000-$400,000

---

**Report Version:** 1.0
**Date:** January 25, 2026
**Next Review:** After Phase 1 completion

---

## Appendix: Quick Reference

### File-Specific Issues

**Most Critical Files:**
- `src/groth16.rs` - CRITICAL-01 (ZK verification broken)
- `src/state/pool_state.rs` - CRITICAL-02 (buffer too small)
- `src/instructions/settle_batch.rs` - CRITICAL-03, CRITICAL-05
- `src/instructions/deposit.rs` - CRITICAL-06
- `src/instructions/withdraw.rs` - CRITICAL-07
- `zk-verifier/src/lib.rs` - CRITICAL-08

### Issue Statistics by Severity

```
CRITICAL:  8 issues (100% must fix)
HIGH:     12 issues ( 80% should fix)
MEDIUM:   15 issues ( 50% should fix)
LOW:       8 issues ( 20% nice to have)
───────────────────────────────────
TOTAL:    43 issues identified
```

### Contact for Clarifications

For questions about this audit report or remediation guidance, please reference:
- Blueprint 10: Solana Programs Architecture
- Blueprint 11: Vault Program
- This audit report ID: NWSP-2026-01-25

---

**END OF SECURITY AUDIT REPORT**
