# NoirWire SDK - PER Examples

This directory contains comprehensive examples demonstrating how to use the NoirWire SDK with wallet-based authentication for Magic Block's PER (Private Execution Runtime) system.

## Examples Overview

### 1. `per-wallet-auth.ts` - Basic Node.js Examples

Complete Node.js/TypeScript examples covering:

- **Basic Authentication**: How to authenticate with a wallet
- **Vault Balance Query**: Querying vault balances with auto-refresh
- **Token Management**: Monitoring and refreshing authentication tokens
- **Error Recovery**: Robust error handling patterns
- **TEE Integrity Verification**: Security checks before operations
- **Complete Workflow**: End-to-end usage demonstration

**Run it:**

```bash
cd packages/sdk
yarn tsx examples/per-wallet-auth.ts
```

### 2. `per-react-integration.tsx` - React Integration Examples

React components and hooks for PER integration:

- **`usePERClient`**: Custom hook for managing PER client
- **`VaultBalance`**: Component for displaying vault balances
- **`TokenExpiryMonitor`**: Real-time token expiry countdown
- **`PERStatusDashboard`**: Complete status overview
- **`VaultOperations`**: Full vault interaction component
- **`PERErrorBoundary`**: Error boundary for PER operations

**Usage in your React app:**

```typescript
import { usePERClient, VaultBalance } from '@noirwire/sdk/examples/per-react-integration';

function MyApp() {
  return (
    <WalletProvider>
      <PERErrorBoundary>
        <VaultBalance vaultId="..." />
      </PERErrorBoundary>
    </WalletProvider>
  );
}
```

## Quick Start

### Installation

```bash
# Install NoirWire SDK
yarn add @noirwire/sdk

# Install Solana wallet adapters (for React)
yarn add @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets
```

### Basic Setup

```typescript
import { createPERConfig, createPERClient } from "@noirwire/sdk";
import { useWallet } from "@solana/wallet-adapter-react";

function MyComponent() {
  const wallet = useWallet();

  async function connectToPER() {
    // 1. Create configuration
    const config = createPERConfig("devnet", {
      verifyIntegrity: true, // Verify TEE before auth
    });

    // 2. Create client
    const perClient = createPERClient(config);

    // 3. Authenticate with wallet
    const authResult = await perClient.authenticate({
      publicKey: wallet.publicKey,
      signMessage: wallet.signMessage,
    });

    console.log("Authenticated! Token expires:", new Date(authResult.expiresAt));

    // 4. Make authenticated requests
    const balance = await perClient.getVaultBalance(vaultId, owner);
  }
}
```

## Authentication Flow

The wallet-based authentication follows this secure flow:

```
1. User connects wallet (Phantom, Solflare, etc.)
   ↓
2. App creates PER client with configuration
   ↓
3. Call perClient.authenticate(wallet)
   ↓
4. SDK optionally verifies TEE integrity [recommended]
   ↓
5. SDK requests wallet signature (user approves)
   ↓
6. Magic Block SDK generates auth token
   ↓
7. Token stored in client (valid ~1 hour)
   ↓
8. All subsequent requests use token parameter
   ↓
9. SDK auto-refreshes token before expiry
```

## Key Features

### 1. Wallet-Based Security

- **No API Keys**: Users sign with their wallet
- **Per-User Auth**: Each user has unique token
- **Hardware Wallet Support**: Works with Ledger, Trezor
- **Short-Lived Tokens**: Auto-expire after 1 hour

### 2. Automatic Token Management

```typescript
const config = createPERConfig("devnet", {
  tokenConfig: {
    ttl: 3600, // 1 hour lifetime
    autoRefresh: true, // Auto-refresh before expiry
    refreshBuffer: 60, // Refresh 1 min early
  },
});
```

The SDK handles:

- Detecting token expiration
- Automatically refreshing tokens
- Retrying failed requests with new token
- Notifying your app of token changes

### 3. TEE Integrity Verification

```typescript
// Verify TEE before authentication (recommended for production)
const authResult = await perClient.authenticate(wallet, {
  verifyIntegrity: true, // Critical security check
});

if (!authResult.integrity?.verified) {
  throw new Error("TEE integrity check failed!");
}
```

### 4. Comprehensive Error Handling

```typescript
try {
  const result = await perClient.getVaultBalance(vaultId, owner);
} catch (error) {
  if (error instanceof PERAuthError) {
    switch (error.code) {
      case "USER_REJECTED":
        // User declined signature
        console.log("Please approve the signature request");
        break;
      case "INTEGRITY_VERIFICATION_FAILED":
        // Critical security issue
        alert("Security check failed - do not proceed!");
        break;
      case "TOKEN_GENERATION_FAILED":
        // Authentication failed
        console.error("Failed to authenticate:", error.details);
        break;
    }
  }
}
```

## Common Patterns

### Pattern 1: Check Authentication Before Operations

```typescript
if (!perClient.isAuthenticated()) {
  await perClient.authenticate(wallet);
}

const result = await perClient.getVaultBalance(vaultId, owner);
```

### Pattern 2: Token Refresh Monitoring

```typescript
perClient.onTokenRefresh((newToken, expiresAt) => {
  console.log("Token refreshed, expires:", new Date(expiresAt));
  // Update UI, save to state, etc.
});
```

### Pattern 3: Robust Error Recovery

```typescript
async function robustQuery(perClient, wallet, vaultId) {
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      if (!perClient.isAuthenticated()) {
        await perClient.authenticate(wallet);
      }

      return await perClient.getVaultBalance(vaultId, owner);
    } catch (error) {
      if (error.code === "USER_REJECTED") {
        throw error; // Don't retry user cancellations
      }

      if (error.code === "NOT_AUTHENTICATED") {
        perClient.disconnect();
        retries++;
        continue;
      }

      throw error;
    }
  }
}
```

### Pattern 4: React Hook for PER Client

```typescript
function usePERClient() {
  const wallet = useWallet();
  const [client, setClient] = useState(null);

  useEffect(() => {
    if (!wallet.publicKey || !wallet.signMessage) return;

    const config = createPERConfig("devnet");
    const perClient = createPERClient(config);

    perClient
      .authenticate({
        publicKey: wallet.publicKey,
        signMessage: wallet.signMessage,
      })
      .then(() => {
        setClient(perClient);
      });

    return () => perClient?.disconnect();
  }, [wallet.publicKey, wallet.signMessage]);

  return client;
}
```

## Security Best Practices

### Always Verify TEE Integrity in Production

```typescript
// ✅ Good - Verify TEE integrity
const authResult = await perClient.authenticate(wallet, {
  verifyIntegrity: true, // MUST be true in production
});

// ❌ Bad - Skip integrity check in production
const authResult = await perClient.authenticate(wallet, {
  verifyIntegrity: false, // Only for localnet testing
});
```

### Handle User Signature Rejections

```typescript
try {
  await perClient.authenticate(wallet);
} catch (error) {
  if (error.code === "USER_REJECTED") {
    // Show friendly message, allow retry
    showNotification("Please approve the signature to continue");
  }
}
```

### Clear Tokens on Wallet Disconnect

```typescript
useEffect(() => {
  if (!wallet.connected) {
    perClient?.disconnect(); // Clear token
  }
}, [wallet.connected]);
```

### Use HTTPS in Production

```typescript
// ✅ Good - Production config
const config = createPERConfig("mainnet", {
  endpoint: "https://tee.magicblock.app", // HTTPS
  verifyIntegrity: true,
});

// ❌ Bad - HTTP in production
const config = createPERConfig("mainnet", {
  endpoint: "http://tee.magicblock.app", // Insecure!
});
```

## Troubleshooting

### Problem: "User declined to sign"

**Solution**: User canceled the wallet signature prompt. Show a clear message explaining why the signature is needed and provide a retry button.

### Problem: "TEE integrity verification failed"

**Solution**: This is a critical security issue. Do NOT proceed with operations. Verify you're using the official Magic Block endpoint. For localnet, set `verifyIntegrity: false`.

### Problem: "Token expired" errors

**Solution**: Should not happen with `autoRefresh: true`. If it does, manually call `await perClient.refreshToken()` or re-authenticate.

### Problem: "Cannot connect to PER endpoint"

**Solution**: Check network connectivity, verify endpoint URL is correct, ensure PER service is running and healthy.

## Additional Resources

- **Full Documentation**: See `/noirwire/PER_CONFIGURATION.md`
- **SDK API Reference**: See `packages/sdk/README.md`
- **Magic Block Docs**: https://docs.magicblock.gg
- **Wallet Adapters**: https://github.com/solana-labs/wallet-adapter

## Support

- **GitHub Issues**: Report bugs and request features
- **Discord**: Join our community for help
- **Email**: security@noirwire.com (for security issues only)

---

**Last Updated**: 2026-01-26
**SDK Version**: 0.2.0
**Authentication**: Wallet-Based (Recommended)
