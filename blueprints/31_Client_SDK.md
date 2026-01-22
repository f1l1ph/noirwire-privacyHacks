# 31 — Client SDK (TypeScript & Rust)

## Overview

This blueprint defines the **NoirWire Client SDK** - libraries that provide a developer-friendly interface for building applications on top of the NoirWire private payment system.

**Architecture Pattern:** Similar to [Railgun](https://railgun.org/), NoirWire uses a two-wallet system:

- Users connect their **Solana wallet** (Phantom, Solflare) for public L1 operations
- Users create/import a separate **NoirWire private wallet** (0zk address) with its own mnemonic for shielded transfers
- This separation ensures privacy: your Solana address is never linked to your private transactions

The SDK provides:

- **Wallet Management**: BIP-32/BIP-39 HD wallets, mnemonic import/export, commitment tracking
- **Transaction Building**: Deposit, transfer, withdraw operations
- **API Integration**: Communication with the NoirWire API backend
- **Real-time Updates**: WebSocket subscriptions for transaction events
- **Vault Operations**: Create and manage shared vaults

Available in:

- **TypeScript/JavaScript** - for web apps, mobile apps (React Native), Node.js servers
- **Rust** - for CLI tools, desktop apps, native integrations

**Wallet Architecture:**

- **Solana L1 Wallet** (Phantom, Solflare, etc.) - Used for deposits/withdrawals to/from the shielded pool
- **NoirWire Private Wallet (0zk address)** - Separate private keys (with own mnemonic) for shielded transfers
- Users can create new private wallets or import from mnemonic/JSON backup
- Similar architecture to Railgun's privacy system

> **Reference:** Integrates with [30_API_Backend.md](30_API_Backend.md) and [20_PER_Execution_Layer.md](20_PER_Execution_Layer.md)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [TypeScript SDK](#2-typescript-sdk)
3. [Rust SDK](#3-rust-sdk)
4. [Common Patterns](#4-common-patterns)
5. [Error Handling](#5-error-handling)
6. [Testing](#6-testing)
7. [Examples](#7-examples)
8. [Publishing](#8-publishing)

---

## 1. Architecture Overview

### Two-Wallet System

NoirWire uses a **two-wallet architecture** for optimal privacy and usability:

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER'S WALLETS                             │
├──────────────────────────────┬──────────────────────────────────┤
│   SOLANA L1 WALLET           │   NOIRWIRE PRIVATE WALLET        │
│   (Phantom, Solflare, etc.)  │   (SDK-managed keys)             │
│                              │                                  │
│   • Public Solana address    │   • Private spending keys        │
│   • Used for deposits        │   • Tracks commitments           │
│   • Used for withdrawals     │   • Private transfers            │
│   • Visible on-chain         │   • Never revealed on-chain      │
└──────────────────────────────┴──────────────────────────────────┘
         │                                  │
         │ Deposit                          │ Transfer (private)
         ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SHIELDED POOL (On-chain)                     │
│   • Merkle tree of commitments                                  │
│   • Nullifier set                                               │
│   • ZK proof verification                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Why Two Wallets?**

- **Solana Wallet**: Public identity for L1 operations (deposit/withdraw)
- **NoirWire Wallet**: Private identity for shielded transfers (completely separate from Solana address)

**Getting Your NoirWire Wallet:**

1. **Create New** - Generate random keys with 12/24-word mnemonic backup
2. **Import from Mnemonic** - Restore from existing 12/24-word recovery phrase
3. **Import from Backup** - Restore from encrypted JSON backup file

### SDK Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT APPLICATION                         │
│   Web App • Mobile App • CLI • Desktop App                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NOIRWIRE SDK                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WALLET MANAGER                              │  │
│  │  • Secret key generation                                 │  │
│  │  • Commitment tracking                                   │  │
│  │  • Balance management                                    │  │
│  │  • Salt generation                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         TRANSACTION BUILDER                              │  │
│  │  • Deposit (shield)                                      │  │
│  │  • Transfer (private)                                    │  │
│  │  │  • Withdraw (unshield)                                │  │
│  │  • Vault operations                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              API CLIENT                                  │  │
│  │  • REST API calls                                        │  │
│  │  • WebSocket subscriptions                               │  │
│  │  • Retry & error handling                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            CRYPTO UTILITIES                              │  │
│  │  • Poseidon2 hash                                        │  │
│  │  • Commitment computation                                │  │
│  │  • Nullifier generation                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │   NoirWire API       │
    │   (Railway)          │
    └──────────────────────┘
```

### Design Principles

| Principle           | Implementation                            |
| ------------------- | ----------------------------------------- |
| **Simple API**      | Intuitive methods, sensible defaults      |
| **Type Safety**     | Full TypeScript types, Rust strong typing |
| **Async/Await**     | Modern async patterns in both languages   |
| **Error Handling**  | Descriptive errors, retry logic           |
| **Extensible**      | Plugin architecture for custom features   |
| **Well Documented** | JSDoc/Rustdoc for all public APIs         |

---

## 2. TypeScript SDK

### 2.1 Project Structure

```
noirwire-sdk/
├── package.json
├── tsconfig.json
├── README.md
│
├── src/
│   ├── index.ts                    # Main exports
│   │
│   ├── client/
│   │   ├── NoirWireClient.ts       # Main SDK class
│   │   └── config.ts               # Configuration types
│   │
│   ├── wallet/
│   │   ├── Wallet.ts               # Wallet management (mnemonic, import/export)
│   │   ├── Commitment.ts           # Commitment tracking
│   │   └── Balance.ts              # Balance queries
│   │
│   ├── solana/
│   │   └── SolanaWalletProvider.tsx # Wallet adapter integration
│   │
│   ├── transactions/
│   │   ├── DepositBuilder.ts       # Deposit transaction
│   │   ├── TransferBuilder.ts      # Transfer transaction
│   │   ├── WithdrawBuilder.ts      # Withdraw transaction
│   │   └── types.ts                # Transaction types
│   │
│   ├── api/
│   │   ├── ApiClient.ts            # HTTP client
│   │   ├── WebSocketClient.ts      # Real-time events
│   │   └── types.ts                # API types
│   │
│   ├── crypto/
│   │   ├── poseidon.ts             # Poseidon2 hash
│   │   ├── commitments.ts          # Commitment utils
│   │   └── nullifiers.ts           # Nullifier utils
│   │
│   ├── vault/
│   │   ├── VaultManager.ts         # Vault operations
│   │   └── types.ts                # Vault types
│   │
│   └── utils/
│       ├── errors.ts               # Custom errors
│       └── helpers.ts              # Helper functions
│
├── examples/
│   ├── basic-transfer.ts
│   ├── vault-example.ts
│   └── realtime-events.ts
│
└── tests/
    ├── wallet.test.ts
    ├── transactions.test.ts
    └── api.test.ts
```

### 2.2 Package Configuration

```json
{
  "name": "@noirwire/sdk",
  "version": "0.1.0",
  "description": "TypeScript SDK for NoirWire private payments",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "docs": "typedoc",
    "lint": "eslint src/**/*.ts",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["solana", "privacy", "zk", "payments", "noirwire"],
  "author": "NoirWire Team",
  "license": "MIT",
  "dependencies": {
    "@solana/web3.js": "^1.87.0",
    "@solana/spl-token": "^0.3.9",
    "@solana/wallet-adapter-base": "^0.9.23",
    "@solana/wallet-adapter-react": "^0.15.35",
    "@solana/wallet-adapter-wallets": "^0.19.32",
    "axios": "^1.6.0",
    "bs58": "^5.0.0",
    "bip39": "^3.1.0",
    "tweetnacl": "^1.0.3",
    "buffer": "^6.0.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typedoc": "^0.25.0",
    "eslint": "^8.55.0"
  }
}
```

### 2.3 Main Client Class

````typescript
// src/client/NoirWireClient.ts

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { ApiClient } from "../api/ApiClient";
import { Wallet } from "../wallet/Wallet";
import { DepositBuilder } from "../transactions/DepositBuilder";
import { TransferBuilder } from "../transactions/TransferBuilder";
import { WithdrawBuilder } from "../transactions/WithdrawBuilder";
import { VaultManager } from "../vault/VaultManager";
import { WebSocketClient } from "../api/WebSocketClient";
import { WalletExport } from "../wallet/Wallet";
import * as bip39 from "bip39";

export interface NoirWireConfig {
  /** NoirWire API base URL */
  apiUrl: string;

  /** Solana RPC endpoint */
  solanaRpcUrl: string;

  /** Pool program ID */
  poolProgramId: string;

  /** Optional: API key for authentication */
  apiKey?: string;

  /** Optional: Custom request timeout (ms) */
  timeout?: number;
}

/**
 * Main NoirWire SDK client
 *
 * @example
 * ```typescript
 * const client = new NoirWireClient({
 *   apiUrl: 'https://api.noirwire.com',
 *   solanaRpcUrl: 'https://api.devnet.solana.com',
 *   poolProgramId: 'NwirePoo1XXX...',
 * });
 *
 * // Create wallet from secret key
 * const wallet = await client.createWallet(secretKey);
 *
 * // Deposit tokens
 * const deposit = await client.deposit(wallet, 1000);
 * ```
 */
export class NoirWireClient {
  private config: NoirWireConfig;
  private api: ApiClient;
  private connection: Connection;
  private wsClient?: WebSocketClient;

  constructor(config: NoirWireConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };

    this.api = new ApiClient(this.config.apiUrl, {
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
    });

    this.connection = new Connection(this.config.solanaRpcUrl, "confirmed");
  }

  /**
   * Create a new wallet with random keys
   * @param withMnemonic - If true, generates a BIP39 mnemonic for easy backup
   * @returns A new wallet instance
   */
  createWallet(withMnemonic: boolean = true): Wallet {
    if (withMnemonic) {
      const mnemonic = bip39.generateMnemonic(128); // 12 words
      return Wallet.fromMnemonic(mnemonic, this.api);
    } else {
      const keypair = Keypair.generate();
      return new Wallet(keypair.secretKey, this.api);
    }
  }

  /**
   * Load wallet from secret key
   * @param secretKey - Secret key bytes (32 or 64 bytes)
   */
  loadWallet(secretKey: Uint8Array): Wallet {
    return new Wallet(secretKey, this.api);
  }

  /**
   * Import wallet from BIP39 mnemonic phrase
   * @param mnemonic - 12 or 24 word mnemonic phrase
   */
  importFromMnemonic(mnemonic: string): Wallet {
    return Wallet.fromMnemonic(mnemonic, this.api);
  }

  /**
   * Import wallet from JSON backup
   * @param backup - Exported wallet JSON
   */
  importFromBackup(backup: WalletExport): Wallet {
    return Wallet.import(backup, this.api);
  }

  /**
   * Deposit tokens into the shielded pool
   * @param wallet - User's wallet
   * @param amount - Amount to deposit (in base units)
   * @param options - Optional parameters
   */
  async deposit(
    wallet: Wallet,
    amount: number,
    options?: {
      vaultId?: Uint8Array;
      onProgress?: (step: string) => void;
    },
  ): Promise<DepositResult> {
    const builder = new DepositBuilder(wallet, this.api, this.connection);
    return builder.execute(amount, options);
  }

  /**
   * Transfer tokens privately
   * @param wallet - Sender's wallet
   * @param receiverPubkey - Receiver's public key
   * @param amount - Amount to transfer
   */
  async transfer(
    wallet: Wallet,
    receiverPubkey: Uint8Array,
    amount: number,
    options?: {
      fromVaultId?: Uint8Array;
      toVaultId?: Uint8Array;
      onProgress?: (step: string) => void;
    },
  ): Promise<TransferResult> {
    const builder = new TransferBuilder(wallet, this.api);
    return builder.execute(receiverPubkey, amount, options);
  }

  /**
   * Withdraw tokens from the shielded pool
   * @param wallet - User's wallet
   * @param amount - Amount to withdraw
   * @param recipient - Recipient's Solana address
   */
  async withdraw(
    wallet: Wallet,
    amount: number,
    recipient: PublicKey,
    options?: {
      onProgress?: (step: string) => void;
    },
  ): Promise<WithdrawResult> {
    const builder = new WithdrawBuilder(wallet, this.api, this.connection);
    return builder.execute(amount, recipient, options);
  }

  /**
   * Get vault manager for vault operations
   */
  vaults(): VaultManager {
    return new VaultManager(this.api);
  }

  /**
   * Subscribe to real-time events
   * @param events - Event types to subscribe to
   * @param callback - Callback for events
   */
  async subscribe(
    events: string[],
    callback: (event: RealtimeEvent) => void,
  ): Promise<WebSocketClient> {
    if (!this.wsClient) {
      this.wsClient = new WebSocketClient(this.config.apiUrl);
      await this.wsClient.connect();
    }

    this.wsClient.subscribe(events, callback);
    return this.wsClient;
  }

  /**
   * Get pool information
   */
  async getPoolInfo(): Promise<PoolInfo> {
    return this.api.get("/api/v1/pool/info");
  }

  /**
   * Get pool statistics
   */
  async getPoolStats(): Promise<PoolStats> {
    return this.api.get("/api/v1/pool/stats");
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.wsClient) {
      await this.wsClient.close();
    }
  }
}

export interface DepositResult {
  success: boolean;
  commitment: string;
  newRoot: string;
  receiptId: string;
  txSignature?: string;
}

export interface TransferResult {
  success: boolean;
  nullifier: string;
  newRoot: string;
  receiptId: string;
}

export interface WithdrawResult {
  success: boolean;
  nullifier: string;
  amount: number;
  recipient: string;
  txSignature?: string;
}

export interface PoolInfo {
  currentRoot: string;
  totalNullifiers: number;
}

export interface PoolStats {
  totalDepositsCount: number;
  totalWithdrawalsCount: number;
  totalDeposited: number;
  totalWithdrawn: number;
  currentTvl: number;
}

export interface RealtimeEvent {
  eventType: string;
  timestamp: number;
  data: any;
}
````

### 2.4 Wallet Class

```typescript
// src/wallet/Wallet.ts

import { Keypair } from "@solana/web3.js";
import { derivePublicKey, generateSalt } from "../crypto/commitments";
import { ApiClient } from "../api/ApiClient";
import { Commitment } from "./Commitment";
import * as bip39 from "bip39";

/**
 * Wallet for managing private balances and commitments
 *
 * This is separate from your Solana L1 wallet (Phantom, Solflare, etc.)
 * It contains private keys for shielded transfers within NoirWire.
 */
export class Wallet {
  private keypair: Keypair;
  private api: ApiClient;
  private commitments: Map<string, Commitment>;
  private mnemonic?: string; // Optional: stored if wallet was created from mnemonic

  constructor(secretKey: Uint8Array, api: ApiClient, mnemonic?: string) {
    this.keypair = Keypair.fromSecretKey(secretKey);
    this.api = api;
    this.commitments = new Map();
    this.mnemonic = mnemonic;
  }

  /**
   * Get wallet's public key
   */
  get publicKey(): Uint8Array {
    return this.keypair.publicKey.toBytes();
  }

  /**
   * Get wallet's secret key (32 bytes)
   */
  get secretKey(): Uint8Array {
    return this.keypair.secretKey.slice(0, 32);
  }

  /**
   * Derive the Poseidon public key hash
   */
  getPoseidonPublicKey(): Uint8Array {
    return derivePublicKey(this.secretKey);
  }

  /**
   * Generate a random salt for commitments
   */
  generateSalt(): Uint8Array {
    return generateSalt();
  }

  /**
   * Add a commitment to wallet tracking
   */
  addCommitment(commitment: Commitment): void {
    const key = Buffer.from(commitment.hash).toString("hex");
    this.commitments.set(key, commitment);
  }

  /**
   * Get all tracked commitments
   */
  getCommitments(): Commitment[] {
    return Array.from(this.commitments.values());
  }

  /**
   * Find commitment by hash
   */
  findCommitment(hash: Uint8Array): Commitment | undefined {
    const key = Buffer.from(hash).toString("hex");
    return this.commitments.get(key);
  }

  /**
   * Get total balance (sum of all commitments)
   */
  getTotalBalance(): number {
    return Array.from(this.commitments.values()).reduce(
      (sum, c) => sum + c.amount,
      0,
    );
  }

  /**
   * Create wallet from BIP39 mnemonic phrase
   * @param mnemonic - 12 or 24 word mnemonic phrase
   * @param api - API client instance
   * @returns Wallet instance
   */
  static fromMnemonic(mnemonic: string, api: ApiClient): Wallet {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic phrase");
    }

    // Derive seed from mnemonic
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const secretKey = seed.slice(0, 32);

    return new Wallet(secretKey, api, mnemonic);
  }

  /**
   * Get mnemonic phrase (if wallet was created from mnemonic)
   * @returns Mnemonic phrase or undefined
   */
  getMnemonic(): string | undefined {
    return this.mnemonic;
  }

  /**
   * Sync commitments from API
   */
  async syncCommitments(): Promise<void> {
    // TODO: Query API for commitments
    // This would require the API to support commitment queries
    // For now, commitments are tracked locally
  }

  /**
   * Export wallet to JSON (for backup)
   */
  export(): WalletExport {
    return {
      version: "1.0",
      secretKey: Buffer.from(this.secretKey).toString("hex"),
      publicKey: this.keypair.publicKey.toBase58(),
      mnemonic: this.mnemonic, // Include if available
      commitments: Array.from(this.commitments.values()).map((c) => c.export()),
    };
  }

  /**
   * Import wallet from JSON backup
   */
  static import(data: WalletExport, api: ApiClient): Wallet {
    const secretKey = Buffer.from(data.secretKey, "hex");
    const wallet = new Wallet(secretKey, api, data.mnemonic);

    for (const commitmentData of data.commitments) {
      const commitment = Commitment.import(commitmentData);
      wallet.addCommitment(commitment);
    }

    return wallet;
  }
}

export interface WalletExport {
  version: string;
  secretKey: string;
  publicKey: string;
  mnemonic?: string; // Optional: included if wallet was created from mnemonic
  commitments: any[];
}
```

### 2.5 Transfer Builder

```typescript
// src/transactions/TransferBuilder.ts

import { Wallet } from "../wallet/Wallet";
import { ApiClient } from "../api/ApiClient";
import { computeCommitment, computeNullifier } from "../crypto/commitments";
import { TransferResult } from "../client/NoirWireClient";

export class TransferBuilder {
  constructor(
    private wallet: Wallet,
    private api: ApiClient,
  ) {}

  async execute(
    receiverPubkey: Uint8Array,
    amount: number,
    options?: {
      fromVaultId?: Uint8Array;
      toVaultId?: Uint8Array;
      onProgress?: (step: string) => void;
    },
  ): Promise<TransferResult> {
    const { onProgress } = options || {};

    onProgress?.("Finding commitment with sufficient balance");

    // 1. Find a commitment with sufficient balance
    const commitment = this.findSufficientCommitment(amount);
    if (!commitment) {
      throw new Error("Insufficient balance");
    }

    onProgress?.("Generating transfer parameters");

    // 2. Generate nonce and salts
    const nonce = this.wallet.generateSalt();
    const receiverSalt = this.wallet.generateSalt();
    const newSenderSalt = this.wallet.generateSalt();

    // 3. Compute nullifier
    const nullifier = computeNullifier(
      commitment.hash,
      this.wallet.secretKey,
      nonce,
    );

    onProgress?.("Preparing transfer request");

    // 4. Build transfer request
    const request = {
      sender_secret: Buffer.from(this.wallet.secretKey).toString("hex"),
      sender_amount: commitment.amount,
      sender_salt: Buffer.from(commitment.salt).toString("hex"),
      sender_vault_id: Buffer.from(
        commitment.vaultId || new Uint8Array(32),
      ).toString("hex"),
      transfer_amount: amount,
      nonce: Buffer.from(nonce).toString("hex"),
      receiver_pubkey: Buffer.from(receiverPubkey).toString("hex"),
      receiver_salt: Buffer.from(receiverSalt).toString("hex"),
      receiver_vault_id: Buffer.from(
        options?.toVaultId || new Uint8Array(32),
      ).toString("hex"),
      new_sender_salt: Buffer.from(newSenderSalt).toString("hex"),
    };

    onProgress?.("Submitting to PER");

    // 5. Submit to API (which forwards to PER)
    const response = await this.api.post<TransferResult>(
      "/api/v1/transfer",
      request,
    );

    onProgress?.("Transfer complete");

    // 6. Update local wallet state
    // Remove old commitment
    this.wallet.removeCommitment(commitment.hash);

    // Add new sender commitment (if remainder)
    if (commitment.amount > amount) {
      const newSenderCommitment = {
        hash: computeCommitment(
          this.wallet.getPoseidonPublicKey(),
          commitment.amount - amount,
          newSenderSalt,
          commitment.vaultId || new Uint8Array(32),
        ),
        amount: commitment.amount - amount,
        salt: newSenderSalt,
        vaultId: commitment.vaultId,
      };
      this.wallet.addCommitment(newSenderCommitment);
    }

    return response;
  }

  private findSufficientCommitment(amount: number) {
    const commitments = this.wallet.getCommitments();

    // Find commitment with exact or higher amount
    return commitments.find((c) => c.amount >= amount) || null;
  }
}
```

### 2.6 Crypto Utilities

```typescript
// src/crypto/poseidon.ts

/**
 * Poseidon2 hash implementation
 *
 * NOTE: This is a placeholder. In production, use a proper Poseidon2
 * implementation like circomlibjs or poseidon-lite
 */

import { createHash } from "crypto";

/**
 * Compute Poseidon2 hash
 * @param inputs - Array of field elements (as Uint8Array)
 * @returns Hash result (32 bytes)
 */
export function poseidon2(inputs: Uint8Array[]): Uint8Array {
  // PLACEHOLDER: Replace with actual Poseidon2 implementation
  // For production, use: https://github.com/iden3/circomlibjs

  // Temporary: Use SHA256 as placeholder
  const hash = createHash("sha256");
  for (const input of inputs) {
    hash.update(input);
  }
  return new Uint8Array(hash.digest());
}

/**
 * Compute Poseidon2 hash from field elements
 * @param fields - Array of 32-byte field elements
 */
export function poseidon2Fields(...fields: Uint8Array[]): Uint8Array {
  return poseidon2(fields);
}
```

```typescript
// src/crypto/commitments.ts

import { poseidon2Fields } from "./poseidon";

const COMMITMENT_DOMAIN = new Uint8Array([0x01]);

/**
 * Derive public key from secret key using Poseidon
 */
export function derivePublicKey(secretKey: Uint8Array): Uint8Array {
  return poseidon2Fields(secretKey);
}

/**
 * Compute commitment
 * commitment = H(domain || owner || amount || salt || vault_id)
 */
export function computeCommitment(
  owner: Uint8Array,
  amount: number,
  salt: Uint8Array,
  vaultId: Uint8Array,
): Uint8Array {
  const amountBytes = new Uint8Array(32);
  new DataView(amountBytes.buffer).setBigUint64(24, BigInt(amount), false);

  return poseidon2Fields(COMMITMENT_DOMAIN, owner, amountBytes, salt, vaultId);
}

/**
 * Compute nullifier
 * nullifier = H(domain || commitment || secret || nonce)
 */
export function computeNullifier(
  commitment: Uint8Array,
  secretKey: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  const NULLIFIER_DOMAIN = new Uint8Array([0x02]);

  return poseidon2Fields(NULLIFIER_DOMAIN, commitment, secretKey, nonce);
}

/**
 * Generate random salt (32 bytes)
 */
export function generateSalt(): Uint8Array {
  if (typeof window !== "undefined" && window.crypto) {
    // Browser
    const salt = new Uint8Array(32);
    window.crypto.getRandomValues(salt);
    return salt;
  } else {
    // Node.js
    const crypto = require("crypto");
    return crypto.randomBytes(32);
  }
}
```

### 2.7 API Client

```typescript
// src/api/ApiClient.ts

import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

export interface ApiClientConfig {
  apiKey?: string;
  timeout?: number;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string, config?: ApiClientConfig) {
    this.client = axios.create({
      baseURL,
      timeout: config?.timeout || 30000,
      headers: {
        "Content-Type": "application/json",
        ...(config?.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          throw new ApiError(
            error.response.status,
            error.response.data.message || error.message,
          );
        }
        throw error;
      },
    );
  }

  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get(path, config);
    return response.data;
  }

  async post<T>(
    path: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post(path, data, config);
    return response.data;
  }

  async put<T>(
    path: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.put(path, data, config);
    return response.data;
  }

  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete(path, config);
    return response.data;
  }
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

### 2.8 WebSocket Client

```typescript
// src/api/WebSocketClient.ts

export class WebSocketClient {
  private ws?: WebSocket;
  private subscriptions: Map<string, (event: any) => void>;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private baseUrl: string) {
    this.subscriptions = new Map();
  }

  async connect(): Promise<void> {
    const wsUrl = this.baseUrl
      .replace("https://", "wss://")
      .replace("http://", "ws://");

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${wsUrl}/ws`);

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed");
        this.attemptReconnect();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  subscribe(events: string[], callback: (event: any) => void): void {
    for (const event of events) {
      this.subscriptions.set(event, callback);
    }

    // Send subscription message to server
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "subscribe",
          events,
        }),
      );
    }
  }

  unsubscribe(events: string[]): void {
    for (const event of events) {
      this.subscriptions.delete(event);
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "unsubscribe",
          events,
        }),
      );
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      const callback = this.subscriptions.get(message.eventType);

      if (callback) {
        callback(message);
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      console.log(
        `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
      );

      setTimeout(() => {
        this.connect().catch(console.error);
      }, delay);
    }
  }

  async close(): Promise<void> {
    this.maxReconnectAttempts = 0; // Prevent reconnection
    this.ws?.close();
  }
}
```

### 2.9 Solana Wallet Integration

For deposits and withdrawals, users need to connect their Solana L1 wallet (Phantom, Solflare, etc.). Here's how to integrate with Solana wallet adapters in a React app:

```typescript
// src/solana/SolanaWalletProvider.tsx

import React, { FC, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  BackpackWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export const SolanaWalletProviderWrapper: FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
```

**Usage in React App:**

```typescript
// App.tsx
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { NoirWireClient } from '@noirwire/sdk';
import { useState } from 'react';

function App() {
  const solanaWallet = useWallet(); // Phantom, Solflare, etc.
  const [noirWireWallet, setNoirWireWallet] = useState<Wallet | null>(null);
  const [client] = useState(() => new NoirWireClient({
    apiUrl: 'https://api.noirwire.com',
    solanaRpcUrl: 'https://api.devnet.solana.com',
    poolProgramId: 'NwirePoo1XXX...',
  }));

  // Step 1: Connect Solana wallet (for deposits/withdrawals)
  const handleConnectSolana = () => {
    // User clicks WalletMultiButton - handled by wallet adapter
  };

  // Step 2: Create or import NoirWire wallet (for private transfers)
  const handleCreateNoirWireWallet = () => {
    const wallet = client.createWallet(true); // with 12-word mnemonic
    setNoirWireWallet(wallet);

    // IMPORTANT: Show mnemonic to user for backup
    const mnemonic = wallet.getMnemonic();
    alert(
      `🔐 SAVE YOUR RECOVERY PHRASE\n\n` +
      `${mnemonic}\n\n` +
      `This is the ONLY way to recover your NoirWire wallet.\n` +
      `Write it down and store it securely.`
    );
  };

  const handleImportNoirWireWallet = (mnemonic: string) => {
    try {
      const wallet = client.importFromMnemonic(mnemonic);
      setNoirWireWallet(wallet);
      alert('Wallet imported successfully!');
    } catch (error) {
      alert('Invalid recovery phrase. Please check and try again.');
    }
  };

  // Step 3: Deposit funds (requires BOTH wallets)
  const handleDeposit = async () => {
    if (!solanaWallet.publicKey || !noirWireWallet) {
      alert('Connect both wallets first');
      return;
    }

    try {
      // Deposit uses:
      // - Solana wallet: Signs the transaction and pays SOL from public address
      // - NoirWire wallet: Creates the private commitment (hidden recipient)
      const result = await client.deposit(noirWireWallet, 1000, {
        onProgress: (step) => console.log(step),
      });
      console.log('Deposit successful:', result);
      console.log('Your SOL is now private - only visible to your NoirWire wallet');
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  // Step 4: Private transfer (only NoirWire wallet needed!)
  const handleTransfer = async (receiverPubkey: Uint8Array, amount: number) => {
    if (!noirWireWallet) {
      alert('NoirWire wallet not connected');
      return;
    }

    // Transfer uses ONLY NoirWire wallet:
    // - No Solana wallet signature required
    // - Fully private, no on-chain link to your Solana address
    // - Only you and the receiver know about this transaction
    const result = await client.transfer(noirWireWallet, receiverPubkey, amount);
    console.log('Private transfer successful:', result);
    console.log('Transaction is completely shielded ✅');
  };

  // Step 5: Withdraw (requires BOTH wallets)
  const handleWithdraw = async (amount: number) => {
    if (!solanaWallet.publicKey || !noirWireWallet) {
      alert('Connect both wallets first');
      return;
    }

    // Withdraw uses:
    // - NoirWire wallet: Proves ownership of private funds via ZK proof
    // - Solana wallet: Receives the public SOL tokens
    const result = await client.withdraw(
      noirWireWallet,
      amount,
      solanaWallet.publicKey // Recipient address
    );
    console.log('Withdrawal successful:', result);
    console.log(`${amount} SOL sent to ${solanaWallet.publicKey.toBase58()}`);
  };

  return (
    <div>
      <h1>NoirWire App</h1>

      {/* Solana Wallet Connection */}
      <div>
        <h2>1. Connect Solana Wallet (for L1 operations)</h2>
        <WalletMultiButton />
        {solanaWallet.publicKey && (
          <p>Connected: {solanaWallet.publicKey.toBase58()}</p>
        )}
      </div>

      {/* NoirWire Wallet */}
      <div>
        <h2>2. NoirWire Private Wallet (0zk address)</h2>
        {!noirWireWallet ? (
          <>
            <button onClick={handleCreateNoirWireWallet}>
              Create New Private Wallet
            </button>
            <button onClick={() => {
              const mnemonic = prompt('Enter your 12-word recovery phrase:');
              if (mnemonic) handleImportNoirWireWallet(mnemonic);
            }}>
              Import from Recovery Phrase
            </button>
            <p style={{ fontSize: '0.9em', color: '#666' }}>
              Your NoirWire wallet is separate from your Solana wallet.
              <br />
              It has its own recovery phrase for privacy.
            </p>
          </>
        ) : (
          <div>
            <p>✅ NoirWire Wallet Connected</p>
            <p>Private Balance: {noirWireWallet.getTotalBalance()} tokens</p>
            <button onClick={() => {
              const mnemonic = noirWireWallet.getMnemonic();
              if (mnemonic) {
                alert(`Your recovery phrase:\n\n${mnemonic}`);
              }
            }}>
              Show Recovery Phrase
            </button>
          </div>
        )}
      </div>

      {/* Operations */}
      {noirWireWallet && (
        <div>
          <h2>3. Operations</h2>
          <button onClick={handleDeposit}>Deposit 1000 tokens</button>
          <button onClick={() => handleTransfer(new Uint8Array(32), 100)}>
            Transfer 100 tokens
          </button>
          <button onClick={() => handleWithdraw(500)}>Withdraw 500 tokens</button>
        </div>
      )}
    </div>
  );
}

export default App;
```

**Wallet Flow Summary:**

| Step                                 | Wallet Type      | Purpose                   |
| ------------------------------------ | ---------------- | ------------------------- |
| **1. Connect Solana Wallet**         | Phantom/Solflare | Deposit/withdraw from L1  |
| **2. Create/Import NoirWire Wallet** | SDK Wallet (0zk) | Private transfers in pool |
| **3. Deposit**                       | Both             | Transfer from L1 → Pool   |
| **4. Transfer**                      | NoirWire only    | Private transfer in pool  |
| **5. Withdraw**                      | Both             | Transfer from Pool → L1   |

**Two Ways to Get NoirWire Wallet:**

1. **Create New** - Generate fresh wallet with 12/24-word mnemonic backup (like creating a new MetaMask wallet)
2. **Import from Mnemonic** - Restore existing NoirWire wallet from recovery phrase

---

## 3. Rust SDK

### 3.1 Project Structure

```
noirwire-sdk-rust/
├── Cargo.toml
├── README.md
│
├── src/
│   ├── lib.rs
│   │
│   ├── client/
│   │   ├── mod.rs
│   │   └── noirwire_client.rs
│   │
│   ├── wallet/
│   │   ├── mod.rs
│   │   ├── wallet.rs
│   │   └── commitment.rs
│   │
│   ├── transactions/
│   │   ├── mod.rs
│   │   ├── deposit.rs
│   │   ├── transfer.rs
│   │   └── withdraw.rs
│   │
│   ├── api/
│   │   ├── mod.rs
│   │   └── client.rs
│   │
│   ├── crypto/
│   │   ├── mod.rs
│   │   ├── poseidon.rs
│   │   └── commitments.rs
│   │
│   └── error.rs
│
├── examples/
│   ├── basic_transfer.rs
│   └── vault_example.rs
│
└── tests/
    └── integration_test.rs
```

### 3.2 Cargo.toml

```toml
[package]
name = "noirwire-sdk"
version = "0.1.0"
edition = "2021"
authors = ["NoirWire Team"]
description = "Rust SDK for NoirWire private payments"
license = "MIT"
repository = "https://github.com/noirwire/sdk-rust"

[dependencies]
# Solana
solana-sdk = "2.0"
solana-client = "2.0"
anchor-client = "0.32.1"

# HTTP client
reqwest = { version = "0.11", features = ["json"] }

# Async runtime
tokio = { version = "1.35", features = ["full"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Cryptography
# TODO: Add Poseidon2 implementation
sha2 = "0.10"
rand = "0.8"
bip39 = "2.0"  # BIP39 mnemonic support

# Error handling
anyhow = "1.0"
thiserror = "1.0"

# Hex encoding
hex = "0.4"
bs58 = "0.5"

[dev-dependencies]
tokio-test = "0.4"
```

### 3.3 Main Client

```rust
// src/client/noirwire_client.rs

use crate::{
    api::client::ApiClient,
    wallet::Wallet,
    transactions::{DepositBuilder, TransferBuilder, WithdrawBuilder},
    error::Result,
};
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

/// NoirWire SDK configuration
pub struct NoirWireConfig {
    /// API base URL
    pub api_url: String,

    /// Solana RPC endpoint
    pub solana_rpc_url: String,

    /// Pool program ID
    pub pool_program_id: String,

    /// Optional API key
    pub api_key: Option<String>,
}

/// Main NoirWire SDK client
pub struct NoirWireClient {
    config: NoirWireConfig,
    api: ApiClient,
}

impl NoirWireClient {
    /// Create a new client
    pub fn new(config: NoirWireConfig) -> Self {
        let api = ApiClient::new(&config.api_url, config.api_key.clone());

        Self { config, api }
    }

    /// Create a new wallet with mnemonic
    pub fn create_wallet(&self, with_mnemonic: bool) -> Wallet {
        if with_mnemonic {
            Wallet::new_with_mnemonic()
        } else {
            Wallet::new()
        }
    }

    /// Load wallet from secret key
    pub fn load_wallet(&self, secret_key: &[u8; 32]) -> Wallet {
        Wallet::from_secret_key(*secret_key)
    }

    /// Import wallet from BIP39 mnemonic
    pub fn import_from_mnemonic(&self, mnemonic: &str) -> Result<Wallet> {
        Wallet::from_mnemonic(mnemonic)
    }

    /// Deposit tokens
    pub async fn deposit(
        &self,
        wallet: &mut Wallet,
        amount: u64,
    ) -> Result<DepositResult> {
        let builder = DepositBuilder::new(wallet, &self.api);
        builder.execute(amount).await
    }

    /// Transfer tokens privately
    pub async fn transfer(
        &self,
        wallet: &mut Wallet,
        receiver_pubkey: &[u8; 32],
        amount: u64,
    ) -> Result<TransferResult> {
        let builder = TransferBuilder::new(wallet, &self.api);
        builder.execute(receiver_pubkey, amount).await
    }

    /// Withdraw tokens
    pub async fn withdraw(
        &self,
        wallet: &mut Wallet,
        amount: u64,
        recipient: &Pubkey,
    ) -> Result<WithdrawResult> {
        let builder = WithdrawBuilder::new(wallet, &self.api);
        builder.execute(amount, recipient).await
    }

    /// Get pool information
    pub async fn get_pool_info(&self) -> Result<PoolInfo> {
        self.api.get("/api/v1/pool/info").await
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct DepositResult {
    pub success: bool,
    pub commitment: String,
    pub new_root: String,
    pub receipt_id: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct TransferResult {
    pub success: bool,
    pub nullifier: String,
    pub new_root: String,
    pub receipt_id: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct WithdrawResult {
    pub success: bool,
    pub nullifier: String,
    pub amount: u64,
    pub recipient: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct PoolInfo {
    pub current_root: String,
    pub total_nullifiers: u64,
}
```

### 3.4 Wallet

```rust
// src/wallet/wallet.rs

use crate::{
    crypto::commitments::{derive_public_key, generate_salt},
    wallet::commitment::Commitment,
    error::{NoirWireError, Result},
};
use rand::RngCore;
use std::collections::HashMap;
use bip39::{Mnemonic, Language};
use sha2::{Sha256, Digest};

pub struct Wallet {
    secret_key: [u8; 32],
    commitments: HashMap<String, Commitment>,
    mnemonic: Option<String>,
}

impl Wallet {
    /// Create a new wallet with random secret key
    pub fn new() -> Self {
        let mut secret_key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut secret_key);

        Self {
            secret_key,
            commitments: HashMap::new(),
            mnemonic: None,
        }
    }

    /// Create a new wallet with BIP39 mnemonic
    pub fn new_with_mnemonic() -> Self {
        let mut entropy = [0u8; 16]; // 128 bits = 12 words
        rand::thread_rng().fill_bytes(&mut entropy);

        let mnemonic = Mnemonic::from_entropy(&entropy).unwrap();
        let mnemonic_str = mnemonic.to_string();

        let seed = mnemonic.to_seed("");
        let mut secret_key = [0u8; 32];
        secret_key.copy_from_slice(&seed[0..32]);

        Self {
            secret_key,
            commitments: HashMap::new(),
            mnemonic: Some(mnemonic_str),
        }
    }

    /// Create wallet from BIP39 mnemonic
    pub fn from_mnemonic(phrase: &str) -> Result<Self> {
        let mnemonic = Mnemonic::parse_in(Language::English, phrase)
            .map_err(|e| NoirWireError::InvalidCommitment(format!("Invalid mnemonic: {}", e)))?;

        let seed = mnemonic.to_seed("");
        let mut secret_key = [0u8; 32];
        secret_key.copy_from_slice(&seed[0..32]);

        Ok(Self {
            secret_key,
            commitments: HashMap::new(),
            mnemonic: Some(phrase.to_string()),
        })
    }

    /// Create wallet from existing secret key
    pub fn from_secret_key(secret_key: [u8; 32]) -> Self {
        Self {
            secret_key,
            commitments: HashMap::new(),
            mnemonic: None,
        }
    }

    /// Get mnemonic phrase if available
    pub fn get_mnemonic(&self) -> Option<&str> {
        self.mnemonic.as_deref()
    }

    /// Get secret key
    pub fn secret_key(&self) -> &[u8; 32] {
        &self.secret_key
    }

    /// Derive Poseidon public key
    pub fn public_key(&self) -> [u8; 32] {
        derive_public_key(&self.secret_key)
    }

    /// Generate random salt
    pub fn generate_salt(&self) -> [u8; 32] {
        generate_salt()
    }

    /// Add commitment to wallet
    pub fn add_commitment(&mut self, commitment: Commitment) {
        let key = hex::encode(commitment.hash);
        self.commitments.insert(key, commitment);
    }

    /// Get all commitments
    pub fn get_commitments(&self) -> Vec<&Commitment> {
        self.commitments.values().collect()
    }

    /// Get total balance
    pub fn total_balance(&self) -> u64 {
        self.commitments.values().map(|c| c.amount).sum()
    }

    /// Find commitment with sufficient balance
    pub fn find_commitment(&self, amount: u64) -> Option<&Commitment> {
        self.commitments.values().find(|c| c.amount >= amount)
    }
}
```

### 3.5 Example Usage

```rust
// examples/basic_transfer.rs

use noirwire_sdk::{NoirWireClient, NoirWireConfig};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize client
    let client = NoirWireClient::new(NoirWireConfig {
        api_url: "https://api.noirwire.com".to_string(),
        solana_rpc_url: "https://api.devnet.solana.com".to_string(),
        pool_program_id: "NwirePoo1XXX...".to_string(),
        api_key: None,
    });

    // Create wallets
    let mut alice = client.create_wallet(true); // with mnemonic
    let bob = client.create_wallet(true);

    println!("Alice public key: {}", hex::encode(alice.public_key()));
    if let Some(mnemonic) = alice.get_mnemonic() {
        println!("Alice mnemonic: {}", mnemonic);
        println!("⚠️  Save this recovery phrase in a secure location!");
    }

    println!("\nBob public key: {}", hex::encode(bob.public_key()));

    // Alice deposits 1000 tokens
    println!("\n1. Depositing 1000 tokens...");
    let deposit = client.deposit(&mut alice, 1000).await?;
    println!("Deposit successful: {}", deposit.commitment);

    // Alice transfers 400 tokens to Bob
    println!("\n2. Transferring 400 tokens to Bob...");
    let transfer = client.transfer(
        &mut alice,
        &bob.public_key(),
        400,
    ).await?;
    println!("Transfer successful: {}", transfer.nullifier);

    // Get pool info
    println!("\n3. Pool info:");
    let pool_info = client.get_pool_info().await?;
    println!("Current root: {}", pool_info.current_root);
    println!("Total nullifiers: {}", pool_info.total_nullifiers);

    Ok(())
}
```

---

## 4. Common Patterns

### 4.1 Error Handling

**TypeScript:**

```typescript
try {
  const result = await client.transfer(wallet, receiverPubkey, 100);
  console.log("Transfer successful:", result.nullifier);
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API error (${error.statusCode}): ${error.message}`);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

**Rust:**

```rust
match client.transfer(&mut wallet, &receiver_pubkey, 100).await {
    Ok(result) => println!("Transfer successful: {}", result.nullifier),
    Err(e) => eprintln!("Transfer failed: {}", e),
}
```

### 4.2 Progress Tracking

**TypeScript:**

```typescript
await client.transfer(wallet, receiverPubkey, 100, {
  onProgress: (step) => {
    console.log(`Progress: ${step}`);
  },
});
```

### 4.3 Real-time Events

**TypeScript:**

```typescript
const ws = await client.subscribe(
  ["transaction.confirmed", "batch.settled"],
  (event) => {
    console.log("Event received:", event.eventType);
    console.log("Data:", event.data);
  },
);

// Later: close connection
await ws.close();
```

---

## 5. Error Handling

### TypeScript Errors

```typescript
// src/utils/errors.ts

export class NoirWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoirWireError";
  }
}

export class InsufficientBalanceError extends NoirWireError {
  constructor(required: number, available: number) {
    super(`Insufficient balance: required ${required}, available ${available}`);
    this.name = "InsufficientBalanceError";
  }
}

export class InvalidCommitmentError extends NoirWireError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommitmentError";
  }
}
```

### Rust Errors

```rust
// src/error.rs

use thiserror::Error;

#[derive(Error, Debug)]
pub enum NoirWireError {
    #[error("Insufficient balance: required {required}, available {available}")]
    InsufficientBalance {
        required: u64,
        available: u64,
    },

    #[error("Invalid commitment: {0}")]
    InvalidCommitment(String),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, NoirWireError>;
```

---

## 6. Testing

### TypeScript Tests

```typescript
// tests/wallet.test.ts

import { NoirWireClient } from "../src";

describe("Wallet", () => {
  let client: NoirWireClient;

  beforeAll(() => {
    client = new NoirWireClient({
      apiUrl: "http://localhost:8080",
      solanaRpcUrl: "http://localhost:8899",
      poolProgramId: "NwirePoo1XXX...",
    });
  });

  test("should create wallet", () => {
    const wallet = client.createWallet();
    expect(wallet.publicKey).toHaveLength(32);
    expect(wallet.secretKey).toHaveLength(32);
  });

  test("should track commitments", () => {
    const wallet = client.createWallet();
    expect(wallet.getTotalBalance()).toBe(0);

    // TODO: Add commitment and verify balance
  });
});
```

### Rust Tests

```rust
// tests/integration_test.rs

use noirwire_sdk::{NoirWireClient, NoirWireConfig};

#[tokio::test]
async fn test_wallet_creation() {
    let client = NoirWireClient::new(NoirWireConfig {
        api_url: "http://localhost:8080".to_string(),
        solana_rpc_url: "http://localhost:8899".to_string(),
        pool_program_id: "NwirePoo1XXX...".to_string(),
        api_key: None,
    });

    let wallet = client.create_wallet();
    assert_eq!(wallet.secret_key().len(), 32);
}
```

---

## 7. Examples

See `examples/` directory for complete examples:

- **basic-transfer.ts** / **basic_transfer.rs** - Simple transfer flow
- **vault-example.ts** / **vault_example.rs** - Vault creation and management
- **realtime-events.ts** - WebSocket subscription example
- **balance-tracking.ts** - Commitment and balance management
- **wallet-management.ts** / **wallet_management.rs** - Wallet creation, import, and derivation

### Wallet Management Example (TypeScript)

```typescript
// examples/wallet-management.ts

import { NoirWireClient } from '@noirwire/sdk';
import { useWallet } from '@solana/wallet-adapter-react';

const client = new NoirWireClient({
  apiUrl: 'https://api.noirwire.com',
  solanaRpcUrl: 'https://api.devnet.solana.com',
  poolProgramId: 'NwirePoo1XXX...',
});

// Method 1: Create new wallet with mnemonic
const wallet1 = client.createWallet(true);
console.log('Mnemonic:', wallet1.getMnemonic());
console.log('Save this phrase to recover your wallet!');

// Method 2: Import from mnemonic
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const wallet2 = client.importFromMnemonic(mnemonic);
console.log('Wallet imported successfully');

// Method 3: Export and import from JSON backup
const backup = wallet1.export();
localStorage.setItem('noirwire-wallet', JSON.stringify(backup));

const restored = client.importFromBackup(
  JSON.parse(localStorage.getItem('noirwire-wallet')!)
);
console.log('Wallet restored from backup');

// Complete wallet lifecycle example
function WalletLifecycleExample() {
  const [wallet, setWallet] = useState<Wallet | null>(null);

  // Save to localStorage
  const saveWallet = (w: Wallet) => {
    const backup = w.export();
    localStorage.setItem('noirwire-wallet-backup', JSON.stringify(backup));
    setWallet(w);
  };

  // Load from localStorage on app start
  useEffect(() => {
    const savedBackup = localStorage.getItem('noirwire-wallet-backup');
    if (savedBackup) {
      const backup = JSON.parse(savedBackup);
      const restored = client.importFromBackup(backup);
      setWallet(restored);
      console.log('Wallet restored from localStorage');
    }
  }, []);

  return (
    <div>
      {!wallet ? (
        <>
          <button onClick={() => saveWallet(client.createWallet(true))}>
            Create New Wallet
          </button>
          <button onClick={() => {
            const mnemonic = prompt('Enter recovery phrase:');
            if (mnemonic) saveWallet(client.importFromMnemonic(mnemonic));
          }}>
            Import Wallet
          </button>
        </>
      ) : (
        <p>Wallet loaded: {wallet.getTotalBalance()} tokens</p>
      )}
    </div>
  );
}
```

### Wallet Management Example (Rust)

```rust
// examples/wallet_management.rs

use noirwire_sdk::{NoirWireClient, NoirWireConfig};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let client = NoirWireClient::new(NoirWireConfig {
        api_url: "https://api.noirwire.com".to_string(),
        solana_rpc_url: "https://api.devnet.solana.com".to_string(),
        pool_program_id: "NwirePoo1XXX...".to_string(),
        api_key: None,
    });

    // Method 1: Create new wallet with mnemonic
    println!("1. Creating new wallet with mnemonic...");
    let wallet1 = client.create_wallet(true);
    if let Some(mnemonic) = wallet1.get_mnemonic() {
        println!("Mnemonic: {}", mnemonic);
        println!("⚠️  Save this recovery phrase in a secure location!\n");
    }

    // Method 2: Import from mnemonic
    println!("2. Importing wallet from mnemonic...");
    let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    let wallet2 = client.import_from_mnemonic(mnemonic)?;
    println!("Wallet imported successfully");
    println!("Public key: {}\n", hex::encode(wallet2.public_key()));

    // Check balance
    println!("3. Checking wallet balances...");
    println!("Wallet 1 balance: {} tokens", wallet1.total_balance());
    println!("Wallet 2 balance: {} tokens\n", wallet2.total_balance());

    println!("✅ All wallet methods demonstrated successfully!");
    Ok(())
}
```

---

## 8. Publishing

### TypeScript (NPM)

```bash
# Build
npm run build

# Test
npm test

# Publish to NPM
npm publish --access public
```

### Rust (crates.io)

```bash
# Test
cargo test

# Publish to crates.io
cargo publish
```

---

## Summary

| Feature             | TypeScript                   | Rust                  |
| ------------------- | ---------------------------- | --------------------- |
| **Package Manager** | NPM                          | crates.io             |
| **Async**           | async/await                  | tokio                 |
| **HTTP Client**     | axios                        | reqwest               |
| **WebSocket**       | native WebSocket             | tokio-tungstenite     |
| **Crypto**          | circomlibjs (Poseidon2)      | Custom implementation |
| **Mnemonic**        | bip39                        | bip39 crate           |
| **Solana Wallet**   | @solana/wallet-adapter-react | N/A (CLI)             |
| **Testing**         | Jest                         | cargo test            |

### Wallet Features

| Feature                  | Description                            | TypeScript | Rust         |
| ------------------------ | -------------------------------------- | ---------- | ------------ |
| **Create New**           | Generate random private keys           | ✅         | ✅           |
| **Create with Mnemonic** | Generate with 12/24-word backup phrase | ✅         | ✅           |
| **Import from Mnemonic** | Restore from recovery phrase           | ✅         | ✅           |
| **Import from JSON**     | Restore from exported backup           | ✅         | ⚠️ Not shown |
| **Export Backup**        | Export wallet state as JSON            | ✅         | ⚠️ Not shown |
| **Commitment Tracking**  | Track unspent notes locally            | ✅         | ✅           |
| **BIP-32/BIP-39**        | Standard HD wallet derivation          | ✅         | ✅           |

---

## References

- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Anchor Client TypeScript](https://www.anchor-lang.com/docs/clients/javascript)
- [Anchor Client Rust](https://docs.rs/anchor-client/latest/anchor_client/)
- [Poseidon Hash (circomlibjs)](https://github.com/iden3/circomlibjs)

---

_Blueprint Version: 1.0_
_Status: Ready for Implementation_
_Dependencies: Requires 30_API_Backend.md_
