# NoirWire SDK

Privacy-preserving payment SDK for Solana with zero-knowledge proofs and TEE integration.

## Features

- **Shielded Transactions**: Deposit, withdraw, and transfer SOL privately
- **Zero-Knowledge Proofs**: Client-side Noir circuit proof generation
- **Vault System**: Multi-user privacy pools with role-based access
- **PER Integration**: MagicBlock TEE for secure vault operations with wallet-based authentication
- **Type-Safe**: Full TypeScript support with comprehensive types

## Installation

```bash
yarn add @noirwire/sdk
```

## Quick Start

### Basic Usage

```typescript
import { NoirWireWallet, NoirWireClient } from "@noirwire/sdk";

// Generate a new wallet
const wallet = NoirWireWallet.generate({ network: "devnet" });

// Or restore from mnemonic
const mnemonic = NoirWireWallet.generateMnemonic();
const restoredWallet = NoirWireWallet.fromMnemonic(mnemonic, { network: "devnet" });

// Create client
const client = new NoirWireClient({
  apiUrl: "http://localhost:8080",
  network: "devnet",
});

// Connect wallet
client.connect(wallet);

// Deposit SOL into shielded pool
const depositTx = await client.deposit(1_000_000_000n); // 1 SOL

// Check pool status
const poolStatus = await client.getPoolStatus();
console.log("Merkle Root:", poolStatus.merkleRoot);
```

### PER Configuration with Wallet Authentication

Configure MagicBlock PER endpoint for vault operations using secure wallet-based authentication:

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import { createPERConfig, createPERClient } from '@noirwire/sdk';

function MyComponent() {
  const wallet = useWallet();

  async function initializePER() {
    // Create config
    const config = createPERConfig('devnet', {
      endpoint: 'https://tee.magicblock.app',
      verifyIntegrity: true,
    });

    // Create client
    const perClient = createPERClient(config);

    // Authenticate with wallet (user signs a message)
    if (wallet.publicKey && wallet.signMessage) {
      await perClient.authenticate({
        publicKey: wallet.publicKey,
        signMessage: wallet.signMessage,
      });
    }

    // Query vault balance (privacy-preserving)
    const vaultId = Buffer.from('your-vault-id-hex', 'hex');
    const result = await perClient.getVaultBalance(vaultId, wallet.publicKey.toString());

    if (result.success) {
      console.log('Vault Balance:', result.data?.totalBalance);
    }
  }

  return <button onClick={initializePER}>Connect to PER</button>;
}
```

### Environment Variables

Create a `.env` file:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# MagicBlock PER Configuration
MAGICBLOCK_TEE_ENDPOINT=https://tee.magicblock.app

# Optional PER Settings
PER_TIMEOUT=30000
PER_VERIFY_INTEGRITY=true
PER_TOKEN_TTL=3600

# API Configuration
API_URL=http://localhost:8080
```

## Advanced Usage

### Proof Generation

```typescript
import { ProofGenerator, loadCircuit } from "@noirwire/sdk";
import depositCircuit from "@noirwire/noir-circuits/target/deposit.json";

// Load compiled circuit
const circuit = loadCircuit(depositCircuit);

// Create proof generator
const prover = new ProofGenerator(circuit);

// Generate deposit proof
const witness = {
  depositAmount: 1_000_000_000n,
  newCommitment: commitment,
  leafIndex: 0,
  oldRoot: currentRoot,
  newRoot: newRoot,
  owner: ownerField,
  vaultId: vaultIdField,
  blinding: blindingFactor,
  insertionProof: merkleProof,
};

const { proof, publicInputs } = await prover.generateDepositProof(witness);

// Verify proof locally
const isValid = await prover.verifyProof(proof.rawProof, publicInputs);
```

### Merkle Tree Operations

```typescript
import { MerkleTree, computeLeafHash } from "@noirwire/sdk";

// Create merkle tree
const tree = new MerkleTree(24); // TREE_DEPTH = 24 for production

// Add commitment
const commitment = computeLeafHash(balance);
const leafIndex = tree.insert(commitment);

// Get merkle proof
const proof = tree.getProof(leafIndex);

// Verify inclusion
const root = tree.getRoot();
const isValid = tree.verifyInclusion(commitment, proof, root);
```

### Cryptographic Primitives

```typescript
import { Poseidon2, computeCommitment, computeNullifier } from "@noirwire/sdk";

// Hash with Poseidon2
const hash = Poseidon2.hash([field1, field2], 2);

// Compute commitment
const commitment = computeCommitment({
  owner: ownerField,
  amount: 1_000_000_000n,
  vaultId: vaultIdField,
  blinding: blindingFactor,
});

// Compute nullifier (NEVER send secret to server!)
const nullifier = computeNullifier(commitment, nullifierSecret, nonce);
```

## PER Client API

### Configuration

```typescript
interface PERConfig {
  endpoint: string; // PER TEE endpoint URL
  timeout: number; // Request timeout (ms)
  verifyIntegrity: boolean; // Enable TEE integrity verification
  retryConfig: {
    maxRetries: number; // Maximum retry attempts
    retryDelay: number; // Initial delay (ms)
  };
  tokenConfig: {
    ttl: number; // Token time-to-live (seconds)
    autoRefresh: boolean; // Auto-refresh tokens
    refreshBuffer: number; // Refresh buffer time (seconds)
  };
}
```

### Methods

#### `authenticate(wallet, options?)`

Authenticate with wallet signature to obtain temporary token.

```typescript
const authResult = await perClient.authenticate({
  publicKey: wallet.publicKey,
  signMessage: wallet.signMessage,
});
// Returns: { token, expiresAt, integrity? }
```

#### `getVaultBalance(vaultId, ownerPublicKey)`

Query vault balance through TEE (privacy-preserving).

```typescript
const result = await perClient.getVaultBalance(vaultId, ownerPubKey);
if (result.success) {
  console.log("Total Balance:", result.data.totalBalance);
  result.data.memberBalances.forEach((m) => {
    console.log(`${m.owner}: ${m.balance}`);
  });
}
```

#### `getVaultMembers(vaultId)`

Get list of vault members.

```typescript
const result = await perClient.getVaultMembers(vaultId);
if (result.success) {
  console.log("Members:", result.data);
}
```

#### `verifyTeeIntegrity()`

Verify TEE integrity before sensitive operations.

```typescript
const integrity = await perClient.verifyTeeIntegrity();
// Returns: { verified, timestamp, measurement? }
```

#### `healthCheck()`

Check PER endpoint health.

```typescript
const isHealthy = await perClient.healthCheck();
```

## Security Best Practices

### Client-Side Security

1. **Never Send Private Keys**: All sensitive operations happen client-side
2. **Verify TEE Integrity**: Always verify TEE integrity in production
3. **Use HTTPS**: Only connect to HTTPS endpoints in production
4. **Secure Storage**: Store wallet keys securely (hardware wallet recommended)

### PER Integration

```typescript
// CORRECT: Generate nullifier client-side
const nullifier = computeNullifier(commitment, secret, nonce);
await client.withdraw(amount, recipient); // Send nullifier, not secret

// WRONG: Never do this!
// await perClient.sendSecret(secret); ❌
```

### Wallet Authentication

```typescript
// Always check authentication status
if (!perClient.isAuthenticated()) {
  await perClient.authenticate(wallet);
}

// Handle authentication errors
try {
  await perClient.authenticate(wallet);
} catch (error) {
  if (error.code === "USER_REJECTED") {
    console.log("User declined signature");
  } else if (error.code === "INTEGRITY_VERIFICATION_FAILED") {
    console.error("TEE integrity check failed - do not proceed!");
  }
}
```

### Configuration Validation

```typescript
import { validatePERConfig } from "@noirwire/sdk";

try {
  validatePERConfig(config);
} catch (error) {
  console.error("Invalid PER config:", error.message);
}
```

## Network-Specific Configuration

### Mainnet

```typescript
const config = createPERConfig("mainnet", {
  endpoint: "https://tee.magicblock.app",
  verifyIntegrity: true, // Always true for mainnet
});
```

### Devnet

```typescript
const config = createPERConfig("devnet", {
  endpoint: process.env.MAGICBLOCK_TEE_ENDPOINT,
  verifyIntegrity: true,
});
```

### Localnet (Testing)

```typescript
const config = createPERConfig("localnet", {
  endpoint: "http://localhost:9000",
  verifyIntegrity: false, // Disabled for local testing
});
```

## Error Handling

```typescript
import { PERClientError, PERAuthError } from "@noirwire/sdk";

try {
  const result = await perClient.getVaultBalance(vaultId, owner);
  if (!result.success) {
    console.error("Operation failed:", result.error);
  }
} catch (error) {
  if (error instanceof PERAuthError) {
    console.error("Authentication error:", error.code, error.message);
  } else if (error instanceof PERClientError) {
    console.error("PER Error:", error.code, error.message);
    console.error("Details:", error.details);
  }
}
```

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import type {
  PERConfig,
  TEEIntegrityResult,
  VaultBalanceResponse,
  PEROperationResult,
  WalletSigner,
  TokenManager,
  Groth16Proof,
  ProofResult,
  DepositWitness,
  WithdrawWitness,
  TransferWitness,
} from "@noirwire/sdk";
```

## Architecture

```
Client App
    ↓
NoirWire SDK
    ├── Wallet (Key Management)
    ├── Client (API Interface)
    ├── ProofGenerator (Noir Circuits)
    ├── PERClient (TEE Integration with Wallet Auth)
    ├── Crypto (Poseidon2, Merkle)
    └── Config (Environment Setup)
```

## Performance

- **Proof Generation**: ~2-5 seconds (client-side, WASM)
- **Merkle Proof**: ~1-5ms (depth 24)
- **PER Query**: ~100-500ms (network latency)
- **Commitment Hash**: <1ms (Poseidon2)

## Development

```bash
# Build SDK
yarn build

# Run tests
yarn test

# Type checking
yarn typecheck

# Lint
yarn lint
```

## Examples

See `/examples` directory for complete examples:

- `basic-deposit.ts` - Simple deposit flow
- `vault-operations.ts` - Multi-user vault management
- `proof-generation.ts` - Client-side proof generation
- `per-wallet-auth.ts` - PER wallet authentication examples
- `per-react-integration.tsx` - React hooks and components

## Additional Resources

For detailed PER configuration and wallet authentication setup, see:

- **PER Configuration Guide**: `/noirwire/PER_CONFIGURATION.md`
- **MagicBlock Documentation**: https://docs.magicblock.gg
- **Solana Wallet Adapters**: https://github.com/solana-labs/wallet-adapter

## License

MIT

## Support

- Documentation: https://docs.noirwire.com
- Discord: https://discord.gg/noirwire
- GitHub: https://github.com/noirwire/noirwire

## Contributing

Contributions welcome! See CONTRIBUTING.md for guidelines.
