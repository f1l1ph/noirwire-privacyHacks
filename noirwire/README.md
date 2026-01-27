# NoirWire

Privacy-preserving payment system on Solana using zero-knowledge proofs and Magic Block PER (Private Ephemeral Rollups).

## 🚀 Quick Start

**Get started in 5 minutes:**

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Follow the quickstart guide
open QUICKSTART.md
```

📖 **[Read the Quick Start Guide](./QUICKSTART.md)** for step-by-step instructions.

## 📚 Documentation

### Getting Started

- **[QUICKSTART.md](./QUICKSTART.md)** - Get NoirWire running in 5 minutes
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deploy to localnet, devnet, or mainnet
- **[LOCAL_TESTING_GUIDE.md](./LOCAL_TESTING_GUIDE.md)** - Comprehensive testing guide

### Technical Details

- **[FIXES_SUMMARY.md](./FIXES_SUMMARY.md)** - Recent fixes and changes
- **[CIRCUIT_LOADING_FIX.md](./CIRCUIT_LOADING_FIX.md)** - Browser circuit loading implementation
- **[FIXES_APPLIED.md](./FIXES_APPLIED.md)** - All issues fixed during development

### Planning

- **[HACKATHON_IMPLEMENTATION_PLAN.md](./HACKATHON_IMPLEMENTATION_PLAN.md)** - Original implementation plan

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Web Browser                       │
│  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Next.js UI  │  │  NoirWire SDK (Circuits)  │  │
│  └───────┬──────┘  └────────────┬──────────────┘  │
└──────────┼────────────────────────┼─────────────────┘
           │                        │
           ↓                        ↓
┌──────────────────┐      ┌────────────────────┐
│ Solana Programs  │      │  Magic Block PER   │
│  (On-chain)      │      │  (Private State)   │
└────────┬─────────┘      └────────────────────┘
         │
         ↓
┌──────────────────┐      ┌────────────────────┐
│    Indexer       │─────→│     Supabase       │
│   (NestJS)       │      │    (Postgres)      │
└──────────────────┘      └────────────────────┘
```

## 📦 Packages

### Applications

- **`apps/web`** - Next.js web application for user interface
- **`apps/indexer`** - NestJS service for indexing Solana events

### Libraries

- **`packages/sdk`** - TypeScript SDK with ZK proof generation
- **`packages/solana-programs`** - Rust programs for Solana blockchain
- **`packages/noir-circuits`** - Noir circuits for zero-knowledge proofs
- **`packages/db`** - Database client for Supabase
- **`packages/types`** - Shared TypeScript types
- **`packages/utils`** - Utility functions

### Configuration

- **`packages/eslint-config`** - Shared ESLint configuration
- **`packages/typescript-config`** - Shared TypeScript configuration
- **`packages/ui`** - Shared React components

## 🛠️ Technology Stack

### Frontend

- Next.js 16
- React 19
- Solana Wallet Adapter
- TailwindCSS

### Backend

- NestJS (Indexer)
- Supabase (PostgreSQL)
- Anchor (Solana framework)

### Cryptography

- Noir (Zero-knowledge circuits)
- Barretenberg (Proof generation)
- Poseidon2 (Hash function)

### Blockchain

- Solana (Layer 1)
- Magic Block PER (Private state)
- Anchor (Smart contracts)

## 🔒 Privacy Features

### Shielded Deposits

Users can deposit SOL into private shielded pools using zero-knowledge proofs. Deposits are represented as commitments in a Merkle tree, hiding the owner and amount.

### Private Withdrawals

Withdrawals use nullifiers to prevent double-spending while maintaining privacy. The proof verifies ownership without revealing which commitment is being spent.

### Encrypted Balances

Account balances are encrypted and stored in the Magic Block PER, providing an additional layer of privacy beyond on-chain data.

### Vaults

Multi-signature vaults with private member lists, enabling private group treasuries and collaborative fund management.

## 🚦 Current Status

### ✅ Complete

- Noir circuits (deposit, withdraw, transfer)
- Solana programs (shielded-pool, zk-verifier, vault-registry)
- SDK implementation with browser support
- Database schema and migrations
- Indexer service
- Web application UI
- Circuit loading in browser
- WASM bundling configuration

### 🔄 Testing

- Local deployment (localnet)
- End-to-end transaction flows
- Proof generation performance

### 📋 TODO

- Devnet deployment
- Security audit
- Performance optimization
- Production readiness

## 🧪 Testing

### Run Unit Tests

```bash
# Test circuits
cd packages/noir-circuits
nargo test

# Test SDK
cd packages/sdk
yarn test

# Test Solana programs
cd packages/solana-programs
anchor test
```

### Local Testing

Follow [LOCAL_TESTING_GUIDE.md](./LOCAL_TESTING_GUIDE.md) for comprehensive testing instructions.

### Quick Test

```bash
# Start infrastructure
solana-test-validator           # Terminal 1
yarn supabase:start             # Terminal 2

# Deploy programs
cd packages/solana-programs
anchor deploy

# Start services
cd apps/indexer && yarn dev     # Terminal 3
cd apps/web && yarn dev         # Terminal 4

# Open browser
open http://localhost:3000
```

## 🐛 Troubleshooting

### Common Issues

| Issue                   | Solution                                                        |
| ----------------------- | --------------------------------------------------------------- |
| "Circuit not loaded"    | Rebuild SDK: `cd packages/sdk && yarn build`                    |
| "Program not found"     | Deploy programs: `cd packages/solana-programs && anchor deploy` |
| "Buffer is not defined" | Polyfills installed: Check `apps/web/package.json`              |
| "Insufficient funds"    | Airdrop SOL: `solana airdrop 10`                                |

See [FIXES_APPLIED.md](./FIXES_APPLIED.md) for detailed troubleshooting.

## 🔧 Development

### Build All Packages

```bash
yarn build
```

### Run Linting

```bash
yarn lint
```

### Format Code

```bash
yarn format
```

### Clean Build Artifacts

```bash
yarn clean
```

## 📊 Performance

- **Circuit Compilation**: ~5 seconds
- **Proof Generation**: 10-15 seconds
- **Transaction Confirmation**: 1-2 seconds (localnet), 5-15 seconds (devnet)
- **Indexer Processing**: < 1 second
- **Bundle Size**: ~2 MB (with circuits and WASM)

## 🔐 Security Considerations

- **Private Keys**: Stored in browser localStorage (demo only, not production-ready)
- **Nullifiers**: Prevents double-spending of shielded notes
- **Merkle Proofs**: Verifies commitment inclusion without revealing position
- **ZK Proofs**: Proves knowledge without revealing secret values

⚠️ **Warning**: This is a hackathon prototype. Do not use with real funds without a thorough security audit.

## 🤝 Contributing

This project was built for a hackathon. For production use:

1. Security audit required
2. Key management improvement needed
3. Production deployment configuration
4. Comprehensive testing
5. Performance optimization

## 📄 License

MIT

## 🙏 Acknowledgments

- [Noir Language](https://noir-lang.org/) - Zero-knowledge proof language
- [Anchor](https://www.anchor-lang.com/) - Solana development framework
- [Magic Block](https://magicblock.gg/) - Private Ephemeral Rollups
- [Solana](https://solana.com/) - High-performance blockchain

## 📞 Support

- Check [FIXES_SUMMARY.md](./FIXES_SUMMARY.md) for recent changes
- Read [LOCAL_TESTING_GUIDE.md](./LOCAL_TESTING_GUIDE.md) for testing help
- Review [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues

---

**Built for Privacy Hacks Hackathon** 🎉

For detailed setup instructions, see [QUICKSTART.md](./QUICKSTART.md).
