# NoirWire Solana Programs

Solana on-chain programs for NoirWire's private payment system.

## Remaining Work

- [ ] Full E2E integration tests with real ZK proofs on devnet
- [ ] Generate vanity program IDs (`NwirePoo1...`)

## Programs

### 1. Shielded Pool (`shielded-pool`)

Main state management program for private transactions.

**Instructions:**

- `initialize` - Create a new shielded pool
- `deposit` - Shield tokens (public → private)
- `withdraw` - Unshield tokens (private → public)
- `settle_batch` - Batch settlement from PER
- `set_paused` - Emergency pause
- `set_emergency_mode` - Enable emergency withdrawals
- `emergency_withdraw` - Admin-authorized fund recovery
- `init_historical_roots` - Initialize 900-root PDA
- `cleanup_nullifier` - Reclaim rent from old nullifiers

**Key Accounts:**

- `PoolState` - Main pool state with merkle roots, versioning
- `HistoricalRoots` - 900-capacity ring buffer PDA
- `NullifierEntry` - Individual nullifier PDAs

### 2. ZK Verifier (`zk-verifier`)

Groth16 proof verification using the audited `groth16-solana` library.

**Instructions:**

- `verify` - Verify a Groth16 proof
- `store_vk` - Store verification key for a circuit

**Features:**

- BN254 elliptic curve operations via alt_bn128 syscalls
- Audited by Light Protocol security audit
- ~150k-200k compute units per verification

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

## Testing

### Quick Start

```bash
# Localnet (recommended for dev)
anchor test

# Just unit tests (no validator needed)
cargo test --package shielded-pool
```

### Manual Validator

```bash
# Terminal 1 - start validator
solana-test-validator --reset

# Terminal 2 - run tests
anchor test --skip-local-validator
```

### Devnet Testing

```bash
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet
anchor test --provider.cluster devnet --skip-deploy
```

### Test Files

| File                                   | Purpose                   |
| -------------------------------------- | ------------------------- |
| `tests/shielded-pool.ts`               | Basic deposit/withdraw    |
| `tests/adversarial.ts`                 | Security attack scenarios |
| `tests/shielded-pool-comprehensive.ts` | Full integration          |

### Troubleshooting

```bash
# View logs
solana logs

# Check validator
solana cluster-version

# Port in use?
pkill solana-test-validator
```

## Architecture

Based on the official blueprints:

- **10_Solana_Programs.md** - Main architecture
- **11_Vault_Program.md** - Vault specifications
- **01_Zk_Noir_Circuits.md** - ZK circuits

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
