# NoirWire Solana Programs

This package contains the Solana on-chain programs for NoirWire's private payment system.

## Initialization Status

**Current Phase: Initial Infrastructure Setup**

This commit initializes the program structure and account definitions. Core ZK verification functionality is stubbed and requires implementation in Phase 2.

### What's Implemented

- Program structure and account definitions
- Instruction handlers with proper account constraints
- Event emission framework
- PDA derivation patterns
- Error handling infrastructure
- Basic state management

### What's Stubbed (TODO)

- ZK proof verification (alt_bn128 integration)
- Merkle tree operations
- Nullifier validation logic
- PER Permission Program CPI integration
- Comprehensive test suite

**WARNING: Do NOT deploy to production.** This is a PoC initialization only.

## Programs

### 1. Shielded Pool (`shielded-pool`)

Main state management program for private transactions.

**Instructions:**

- `initialize` - Create a new shielded pool
- `deposit` - Shield tokens (public → private)
- `withdraw` - Unshield tokens (private → public)
- `settle_batch` - Batch settlement from PER
- `set_paused` - Emergency pause

**Key Accounts:**

- `PoolState` - Main pool state with merkle roots
- `NullifierEntry` - Individual nullifier PDAs

**Known Limitations (PoC):**

- `HISTORICAL_ROOTS_SIZE = 8` (3.2 second spending window) vs blueprint spec of 900 (6 minutes)
- Reduced to fit Solana's 4KB stack limit
- Production MUST implement separate PDA for historical roots storage

### 2. ZK Verifier (`zk-verifier`)

Groth16 proof verification using Solana's alt_bn128 syscalls.

**Instructions:**

- `verify` - Verify a Groth16 proof
- `store_vk` - Store verification key for a circuit

**Features:**

- BN254 elliptic curve operations
- Pairing-based verification
- ~400k-500k compute units per proof

**CRITICAL TODO:** ZK verification is currently stubbed. The `alt_bn128` module integration needs to be implemented in `programs/zk-verifier/src/groth16.rs`. Requires `solana-program = "2.0"` with alt_bn128 syscall support.

### 3. Vault Registry (`vault-registry`)

Vault management with PER Permission Program integration.

**Instructions:**

- `create_vault` - Create a new vault
- `add_vault_member` - Add member to vault
- `remove_vault_member` - Remove member from vault

**Key Accounts:**

- `Vault` - Vault state with permission group ID

## Setup

### Prerequisites

- Rust 1.70+
- Solana CLI 1.18+
- Anchor CLI 0.31.1

### Build

```bash
# Install dependencies
yarn install

# Build all programs
anchor build

# Run tests
anchor test
```

### Deploy to Localnet

```bash
# Start local validator
solana-test-validator

# Deploy programs
anchor deploy
```

### Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

## Architecture

Based on the official blueprints:

- **10_Solana_Programs.md** - Main architecture
- **11_Vault_Program.md** - Vault specifications
- **01_Zk_Noir_Circuits.md** - ZK circuits

### Implementation Notes

**Blueprint Adherence:**
- Program structure: 100% matches blueprint
- Account definitions: 100% matches blueprint
- PDA derivation patterns: Follows blueprint exactly
- Error handling: Custom errors as specified

**Deviations (Temporary for PoC):**
- `HISTORICAL_ROOTS_SIZE = 8` instead of 900 (stack limit constraint)
- Deposit/Withdraw instructions missing `ProofData` parameter (added in Phase 2)
- ZK verification stubbed (requires alt_bn128 integration)
- PER Permission Program integration stubbed (requires CPI implementation)

## Critical TODOs (Phase 2)

### Priority 1: ZK Verification (BLOCKER)

**File:** `programs/zk-verifier/src/groth16.rs`

- [ ] Implement `alt_bn128_addition()` using `solana_program::alt_bn128`
- [ ] Implement `alt_bn128_multiplication()` using syscalls
- [ ] Implement `alt_bn128_pairing()` for final verification
- [ ] Verify `solana-program = "2.0"` dependency supports alt_bn128
- [ ] Test with actual Groth16 proofs from Noir circuits

**Files needing ZK integration:**
- `programs/shielded-pool/src/instructions/deposit.rs:49` - Add proof verification
- `programs/shielded-pool/src/instructions/withdraw.rs:68` - Add proof verification
- `programs/shielded-pool/src/instructions/settle_batch.rs:33` - Add batch proof verification

### Priority 2: Noir Circuit Implementation

**Location:** `../noir-circuits/circuits/src/`

- [ ] Implement Merkle tree verification in `primitives/merkle.nr`
- [ ] Complete deposit circuit logic in `core/deposit.nr`
- [ ] Complete transfer circuit with nullifier checks in `core/transfer.nr`
- [ ] Complete withdraw circuit in `core/withdraw.nr`
- [ ] Implement batch aggregation in `batch/batch_{2,4,8}.nr`
- [ ] Generate verification keys for all circuits
- [ ] Test proof generation and verification end-to-end

### Priority 3: Testing

- [ ] Add basic initialization tests (account creation, state transitions)
- [ ] Write unit tests for each instruction handler
- [ ] Integration tests with mock proofs (before ZK implementation)
- [ ] Full E2E tests with real ZK proofs (after ZK implementation)
- [ ] Fuzzing for edge cases and security

### Priority 4: PER Integration

**File:** `programs/vault-registry/src/lib.rs:33-35`

- [ ] Implement CPI to PER Permission Program for group creation
- [ ] Add delegation hooks using `ephemeral-rollups-sdk`
- [ ] Test batch settlement flow from PER to shielded pool
- [ ] Remove placeholder `vault.permission_group = vault_id` hack

### Priority 5: Production Readiness

- [ ] Increase `HISTORICAL_ROOTS_SIZE` to 900 OR implement PDA solution
- [ ] Add `ProofData` parameter to deposit/withdraw instruction signatures
- [ ] Security audit of all constraint checks
- [ ] Validate nullifier uniqueness enforcement
- [ ] Test emergency pause scenarios
- [ ] Generate final program IDs for mainnet

## Build Verification

### Solana Programs

```bash
# Build all programs
yarn build  # or: anchor build

# Lint and format
yarn lint          # Run clippy
yarn format:check  # Check formatting
yarn format        # Auto-fix formatting
```

**Build Status:** ✅ All programs compile successfully

Compiled binaries (in `target/deploy/`):
- `shielded_pool.so` (329KB)
- `zk_verifier.so` (271KB)
- `vault_registry.so` (232KB)

IDL files generated (in `target/idl/`):
- `shielded_pool.json` (20KB)
- `zk_verifier.json` (7.4KB)
- `vault_registry.json` (8.6KB)

### Noir Circuits

```bash
cd ../noir-circuits

# Type check all circuits
yarn check  # or: nargo check

# Format circuits
yarn format  # or: nargo fmt
```

**Build Status:** ✅ All circuits type-check successfully

Note: Circuits are configured as a library (`type = "lib"`) for shared primitives. Individual circuit compilation will be set up in Phase 2 when generating verification keys.

## Program IDs

Current devnet program IDs (generated during development):

- Shielded Pool: `GHaaCGvizKd7QVCw93vHHc3bDQ1JNdufT4ZX9RbeR6Pj`
- ZK Verifier: `E2iDwQ5pjSk4qxmXj7U1NUsqPyFGyfeVYj1CBXqL6fBw`
- Vault Registry: `FXVuM3iLQgejHHoTw6Gqh77MEGcniR6VK8sHTwPSRSvG`

Note: These will be regenerated for production deployment with vanity addresses like `NwirePoo1...`

## Dependencies

- `anchor-lang` - Solana framework
- `anchor-spl` - SPL token utilities
- `solana-program` - Core Solana types
- `num-bigint` - Big integer arithmetic for BN254
- `ephemeral-rollups-sdk` - MagicBlock PER integration

## References

- [Anchor Documentation](https://www.anchor-lang.com/)
- [MagicBlock PER Docs](https://docs.magicblock.gg/)
- [Solana Cookbook](https://solanacookbook.com/)
