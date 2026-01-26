// NoirWire SDK - Production-Ready Main Entry Point

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import * as bip39 from "bip39";
import nacl from "tweetnacl";
import type { NoirWireWalletConfig } from "@noirwire/types";
import { bytesToHex } from "@noirwire/utils";

// Import all SDK modules
import {
  computeCommitment,
  computeNullifier,
  deriveOwner,
  generateBlinding,
  generateNullifierSecret,
  bigintToBytes32,
  bytes32ToBigint,
  type Balance,
} from "./crypto/poseidon2";
import { ProofGenerator, type DepositWitness, type WithdrawWitness } from "./proof/generator";
import { CircuitRegistry } from "./proof/circuits";
import { SolanaClient, type DepositProofData, type WithdrawProofData } from "./solana/client";
import { StateManager, createStateManager, type CommitmentRecord } from "./state/manager";

// Re-export all modules
export * from "./crypto";
export * from "./proof";
export * from "./solana";
export * from "./state";
export * from "./per";
export * from "./config";

// Re-export types from @noirwire/types
export type {
  ApiResponse,
  Commitment,
  Nullifier,
  NoirWireWalletConfig,
  EncryptedNote,
  Vault,
  VaultMember,
  ZkProof,
  TransferProofInputs,
  DepositProofInputs,
  WithdrawProofInputs,
  TransactionType,
  TransactionStatus,
  Transaction,
} from "@noirwire/types";

// Re-export utils
export * from "@noirwire/utils";

// ============================================
// NoirWire Wallet
// ============================================

export class NoirWireWallet {
  private secretKey: Uint8Array;
  private publicKey: Uint8Array;
  private connection: Connection;
  private ownerField: bigint | null = null; // Cached owner field element

  private constructor(secretKey: Uint8Array, config: NoirWireWalletConfig) {
    this.secretKey = secretKey;
    const keyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
    this.publicKey = keyPair.publicKey;

    const rpcUrl = config.rpcUrl || this.getDefaultRpcUrl(config.network);
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  private getDefaultRpcUrl(network: NoirWireWalletConfig["network"]): string {
    switch (network) {
      case "mainnet":
        return "https://api.mainnet-beta.solana.com";
      case "devnet":
        return "https://api.devnet.solana.com";
      case "localnet":
        return "http://localhost:8899";
    }
  }

  /**
   * Generate a new wallet with random keys
   */
  static generate(config: NoirWireWalletConfig = { network: "devnet" }): NoirWireWallet {
    const keyPair = nacl.sign.keyPair();
    return new NoirWireWallet(keyPair.secretKey, config);
  }

  /**
   * Restore wallet from mnemonic phrase
   */
  static fromMnemonic(
    mnemonic: string,
    config: NoirWireWalletConfig = { network: "devnet" },
  ): NoirWireWallet {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic phrase");
    }
    const seed = bip39.mnemonicToSeedSync(mnemonic).slice(0, 32);
    const keyPair = nacl.sign.keyPair.fromSeed(seed);
    return new NoirWireWallet(keyPair.secretKey, config);
  }

  /**
   * Restore wallet from secret key
   */
  static fromSecretKey(
    secretKey: Uint8Array,
    config: NoirWireWalletConfig = { network: "devnet" },
  ): NoirWireWallet {
    return new NoirWireWallet(secretKey, config);
  }

  /**
   * Generate a new mnemonic phrase
   */
  static generateMnemonic(): string {
    return bip39.generateMnemonic(256); // 24 words
  }

  /**
   * Get the public key as hex string
   */
  getPublicKeyHex(): string {
    return bytesToHex(this.publicKey);
  }

  /**
   * Get the Solana public key
   */
  getSolanaPublicKey(): PublicKey {
    return new PublicKey(this.publicKey);
  }

  /**
   * Get the Solana Keypair (for signing transactions)
   */
  getSolanaKeypair(): Keypair {
    return Keypair.fromSecretKey(this.secretKey);
  }

  /**
   * Get owner as field element (derived from secret key)
   * Cached for performance
   */
  async getOwnerField(): Promise<bigint> {
    if (this.ownerField === null) {
      // Derive owner from secret key hash
      const secretKeyBigint = bytes32ToBigint(this.secretKey.slice(0, 32));
      this.ownerField = await deriveOwner(secretKeyBigint);
    }
    return this.ownerField;
  }

  /**
   * Get secret key as bigint (for ZK proofs)
   * SECURITY: Only use this in private witness generation
   */
  getSecretKeyBigint(): bigint {
    return bytes32ToBigint(this.secretKey.slice(0, 32));
  }

  /**
   * Export the secret key (use with caution!)
   */
  exportSecretKey(): Uint8Array {
    return this.secretKey.slice();
  }

  /**
   * Get the connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }
}

// ============================================
// NoirWire Client Configuration
// ============================================

export interface NoirWireClientConfig {
  network: NoirWireWalletConfig["network"];
  rpcUrl?: string;
  tokenMint: PublicKey; // Token mint for the shielded pool
  verificationKey: PublicKey; // Verification key account for ZK proofs
  vaultId?: bigint; // Optional vault ID (0 for solo users)
}

// ============================================
// NoirWire Client - Production Implementation
// ============================================

export class NoirWireClient {
  private config: NoirWireClientConfig;
  private wallet: NoirWireWallet | null = null;
  private connection: Connection;
  private solanaClient: SolanaClient;
  private stateManager: StateManager | null = null;
  private depositProver: ProofGenerator | null = null;
  private withdrawProver: ProofGenerator | null = null;

  constructor(config: NoirWireClientConfig) {
    this.config = config;

    // Initialize connection
    const rpcUrl = config.rpcUrl || this.getDefaultRpcUrl(config.network);
    this.connection = new Connection(rpcUrl, "confirmed");

    // Initialize Solana client
    this.solanaClient = new SolanaClient(this.connection, config.tokenMint);
  }

  private getDefaultRpcUrl(network: NoirWireWalletConfig["network"]): string {
    switch (network) {
      case "mainnet":
        return "https://api.mainnet-beta.solana.com";
      case "devnet":
        return "https://api.devnet.solana.com";
      case "localnet":
        return "http://localhost:8899";
    }
  }

  /**
   * Connect a wallet to the client
   */
  async connect(wallet: NoirWireWallet): Promise<void> {
    this.wallet = wallet;

    // Initialize state manager
    if (!this.stateManager) {
      this.stateManager = await createStateManager(20); // Tree depth 20 for production
    }

    // TODO: Sync state from on-chain events
    // await this.stateManager.syncFromChain();
  }

  /**
   * Disconnect the wallet
   */
  disconnect(): void {
    this.wallet = null;
  }

  /**
   * Check if a wallet is connected
   */
  isConnected(): boolean {
    return this.wallet !== null;
  }

  /**
   * Get the connected wallet
   */
  getWallet(): NoirWireWallet {
    if (!this.wallet) {
      throw new Error("No wallet connected. Call connect() first.");
    }
    return this.wallet;
  }

  /**
   * Get the state manager
   */
  getStateManager(): StateManager {
    if (!this.stateManager) {
      throw new Error("State manager not initialized. Call connect() first.");
    }
    return this.stateManager;
  }

  /**
   * Initialize proof generators (lazy loading)
   */
  private async initProvers(): Promise<void> {
    if (!this.depositProver) {
      const depositCircuit = CircuitRegistry.getDepositCircuit();
      this.depositProver = new ProofGenerator(depositCircuit);
    }

    if (!this.withdrawProver) {
      const withdrawCircuit = CircuitRegistry.getWithdrawCircuit();
      this.withdrawProver = new ProofGenerator(withdrawCircuit);
    }
  }

  // ============================================
  // Deposit Operations
  // ============================================

  /**
   * Deposit tokens into the shielded pool
   * Creates a private balance commitment and proves correct formation
   */
  async deposit(amount: bigint): Promise<string> {
    const wallet = this.getWallet();
    const stateManager = this.getStateManager();
    await this.initProvers();

    // Generate commitment parameters
    const owner = await wallet.getOwnerField();
    const vaultId = this.config.vaultId ?? 0n;
    const blinding = generateBlinding();
    const nullifierSecret = generateNullifierSecret();

    // Compute commitment
    const balance: Balance = {
      owner,
      amount,
      vaultId,
      blinding,
    };
    const commitment = await computeCommitment(balance);

    // Get current Merkle tree state
    const tree = stateManager.getTree();
    const oldRoot = tree.getRoot();
    const leafIndex = tree.getLeafCount();

    // Insert commitment into tree to get proof and new root
    const { root: newRoot, proof: insertionProof } = await tree.insert(commitment);

    // Generate ZK proof
    const depositWitness: DepositWitness = {
      // Public inputs
      depositAmount: amount,
      newCommitment: commitment,
      leafIndex,
      oldRoot,
      newRoot,

      // Private inputs
      owner,
      vaultId,
      blinding,
      insertionProof,
    };

    const proofResult = await this.depositProver!.generateDepositProof(depositWitness);

    // Format proof data for Solana
    const proofData: DepositProofData = {
      proof: proofResult.proof,
      depositAmount: bigintToBytes32(amount),
      newCommitment: bigintToBytes32(commitment),
      leafIndex: bigintToBytes32(BigInt(leafIndex)),
      oldRoot: bigintToBytes32(oldRoot),
      newRoot: bigintToBytes32(newRoot),
    };

    // Execute deposit transaction on Solana
    const result = await this.solanaClient.deposit(
      wallet.getSolanaKeypair(),
      new BN(amount.toString()),
      proofData,
      this.config.verificationKey,
    );

    // Store commitment in local state
    const commitmentRecord: CommitmentRecord = {
      commitment,
      amount,
      owner,
      vaultId,
      blinding,
      nullifierSecret,
      leafIndex,
      timestamp: Date.now(),
      txSignature: result.signature,
      spent: false,
    };
    await stateManager.addCommitment(commitmentRecord);

    return result.signature;
  }

  // ============================================
  // Withdraw Operations
  // ============================================

  /**
   * Withdraw tokens from the shielded pool
   * Proves ownership of sufficient balance and generates nullifier
   */
  async withdraw(amount: bigint, recipient: PublicKey): Promise<string> {
    const wallet = this.getWallet();
    const stateManager = this.getStateManager();
    await this.initProvers();

    // Find commitment(s) with sufficient balance
    const commitments = stateManager.findCommitmentsForAmount(amount);
    if (commitments.length === 0) {
      throw new Error("Insufficient balance");
    }

    // For now, use the first commitment (single-input withdrawal)
    // TODO: Support multi-input withdrawals
    const commitment = commitments[0]!;
    if (commitment.amount < amount) {
      throw new Error(
        "Multi-input withdrawals not yet implemented. Please withdraw full commitment amount.",
      );
    }

    // Get Merkle proof for the commitment
    const tree = stateManager.getTree();
    const oldRoot = tree.getRoot();
    const merkleProof = await tree.getProof(commitment.leafIndex);

    // Generate nullifier
    const nullifierSecret = commitment.nullifierSecret;
    const nonce = 0n; // Increment for multiple spends of same commitment
    const nullifier = await computeNullifier(commitment.commitment, nullifierSecret, nonce);

    // Calculate remaining balance and new commitment
    const remainingBalance = commitment.amount - amount;
    let newRoot = oldRoot;
    let newBalanceBlinding = 0n;
    let newBalanceLeafIndex = 0;
    let newBalanceProof = merkleProof;

    if (remainingBalance > 0) {
      // Create new commitment for change
      newBalanceBlinding = generateBlinding();
      const newBalance: Balance = {
        owner: commitment.owner,
        amount: remainingBalance,
        vaultId: commitment.vaultId,
        blinding: newBalanceBlinding,
      };
      const newCommitment = await computeCommitment(newBalance);

      // Update tree: old commitment -> new commitment (for change)
      const updateResult = await tree.update(commitment.leafIndex, newCommitment);
      newRoot = updateResult.newRoot;
      newBalanceProof = updateResult.proof;
      newBalanceLeafIndex = commitment.leafIndex;
    } else {
      // Full withdrawal: zero out the leaf
      const updateResult = await tree.update(commitment.leafIndex, 0n);
      newRoot = updateResult.newRoot;
      newBalanceProof = updateResult.proof;
      newBalanceLeafIndex = commitment.leafIndex;
    }

    // Generate ZK proof
    const withdrawWitness: WithdrawWitness = {
      // Public inputs
      amount,
      recipient: BigInt("0x" + recipient.toBuffer().toString("hex")),
      nullifier,
      oldRoot,
      newRoot,

      // Private inputs
      owner: commitment.owner,
      balance: commitment.amount,
      vaultId: commitment.vaultId,
      blinding: commitment.blinding,
      merkleProof,
      leafIndex: commitment.leafIndex,
      nullifierSecret,
      nonce,
      newBalanceBlinding,
      newBalanceLeafIndex,
      newBalanceProof,
    };

    const proofResult = await this.withdrawProver!.generateWithdrawProof(withdrawWitness);

    // Format proof data for Solana
    const proofData: WithdrawProofData = {
      proof: proofResult.proof,
      amount: bigintToBytes32(amount),
      recipient: bigintToBytes32(BigInt("0x" + recipient.toBuffer().toString("hex"))),
      nullifier: bigintToBytes32(nullifier),
      oldRoot: bigintToBytes32(oldRoot),
      newRoot: bigintToBytes32(newRoot),
    };

    // Execute withdraw transaction on Solana
    const result = await this.solanaClient.withdraw(
      wallet.getSolanaKeypair(),
      recipient,
      proofData,
      this.config.verificationKey,
    );

    // Mark commitment as spent
    stateManager.markAsSpent(commitment.commitment, result.signature);

    // If there's change, add new commitment
    if (remainingBalance > 0) {
      const newCommitmentRecord: CommitmentRecord = {
        commitment: await computeCommitment({
          owner: commitment.owner,
          amount: remainingBalance,
          vaultId: commitment.vaultId,
          blinding: newBalanceBlinding,
        }),
        amount: remainingBalance,
        owner: commitment.owner,
        vaultId: commitment.vaultId,
        blinding: newBalanceBlinding,
        nullifierSecret: generateNullifierSecret(), // New nullifier secret for change
        leafIndex: newBalanceLeafIndex,
        timestamp: Date.now(),
        txSignature: result.signature,
        spent: false,
      };
      await stateManager.addCommitment(newCommitmentRecord);
    }

    return result.signature;
  }

  // ============================================
  // Query Operations
  // ============================================

  /**
   * Get pool status and statistics from on-chain state
   */
  async getPoolStatus(): Promise<{
    totalDeposits: string;
    merkleRoot: string;
    leafCount: number;
  }> {
    const stats = await this.solanaClient.getPoolStatistics();
    return {
      totalDeposits: stats.totalDeposits.toString(),
      merkleRoot: bytesToHex(stats.merkleRoot),
      leafCount: stats.leafCount,
    };
  }

  /**
   * Get local balance (from tracked commitments)
   */
  getBalance(): bigint {
    if (!this.stateManager) {
      return 0n;
    }
    return this.stateManager.getTotalUnspentBalance();
  }

  /**
   * Get all unspent commitments
   */
  getUnspentCommitments(): CommitmentRecord[] {
    if (!this.stateManager) {
      return [];
    }
    return this.stateManager.getUnspentCommitments();
  }

  /**
   * Export local state for backup
   */
  exportState(): string {
    if (!this.stateManager) {
      throw new Error("No state to export. Connect wallet first.");
    }
    return this.stateManager.exportState();
  }

  /**
   * Import state from backup
   */
  async importState(json: string): Promise<void> {
    if (!this.stateManager) {
      this.stateManager = await createStateManager(20);
    }
    await this.stateManager.importState(json);
  }
}
