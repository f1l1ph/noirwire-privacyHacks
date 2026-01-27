/**
 * NoirWire SDK - State Manager
 * Tracks user commitments, nullifier secrets, and Merkle tree state
 */

import { MerkleTree, createMerkleTree, TREE_DEPTH } from "../crypto/merkle";
import { computeCommitment, Balance } from "../crypto/poseidon2";

// Re-export TREE_DEPTH for use by client
export { TREE_DEPTH };

/**
 * Commitment metadata stored locally
 */
export interface CommitmentRecord {
  commitment: bigint;
  amount: bigint;
  owner: bigint;
  vaultId: bigint;
  blinding: bigint;
  nullifierSecret: bigint;
  leafIndex: number;
  timestamp: number;
  txSignature?: string;
  spent: boolean;
}

/**
 * State manager for tracking commitments and Merkle tree
 */
export class StateManager {
  private tree: MerkleTree | null = null;
  private commitments: Map<string, CommitmentRecord> = new Map();
  private nullifierSecrets: Map<string, bigint> = new Map(); // commitment -> nullifier_secret

  constructor() {}

  /**
   * Initialize the state manager with a Merkle tree
   */
  async init(treeDepth: number = TREE_DEPTH): Promise<void> {
    this.tree = await createMerkleTree(treeDepth);
  }

  /**
   * Get the Merkle tree instance
   */
  getTree(): MerkleTree {
    if (!this.tree) {
      throw new Error("State manager not initialized. Call init() first.");
    }
    return this.tree;
  }

  /**
   * Add a commitment record
   */
  async addCommitment(record: CommitmentRecord): Promise<void> {
    const commitmentHex = record.commitment.toString(16).padStart(64, "0");
    this.commitments.set(commitmentHex, record);

    // Store nullifier secret mapping
    this.nullifierSecrets.set(commitmentHex, record.nullifierSecret);

    // Insert into Merkle tree if not already present
    if (this.tree) {
      const currentLeafCount = this.tree.getLeafCount();
      if (record.leafIndex >= currentLeafCount) {
        await this.tree.insert(record.commitment);
      }
    }
  }

  /**
   * Get a commitment record by commitment hash
   */
  getCommitment(commitment: bigint): CommitmentRecord | undefined {
    const commitmentHex = commitment.toString(16).padStart(64, "0");
    return this.commitments.get(commitmentHex);
  }

  /**
   * Get all unspent commitments
   */
  getUnspentCommitments(): CommitmentRecord[] {
    return Array.from(this.commitments.values()).filter((record) => !record.spent);
  }

  /**
   * Get total unspent balance
   */
  getTotalUnspentBalance(): bigint {
    return this.getUnspentCommitments().reduce((total, record) => total + record.amount, 0n);
  }

  /**
   * Mark a commitment as spent
   */
  markAsSpent(commitment: bigint, txSignature?: string): void {
    const commitmentHex = commitment.toString(16).padStart(64, "0");
    const record = this.commitments.get(commitmentHex);
    if (record) {
      record.spent = true;
      if (txSignature) {
        record.txSignature = txSignature;
      }
      this.commitments.set(commitmentHex, record);
    }
  }

  /**
   * Get nullifier secret for a commitment
   */
  getNullifierSecret(commitment: bigint): bigint | undefined {
    const commitmentHex = commitment.toString(16).padStart(64, "0");
    return this.nullifierSecrets.get(commitmentHex);
  }

  /**
   * Find commitments with sufficient balance for withdrawal
   */
  findCommitmentsForAmount(targetAmount: bigint): CommitmentRecord[] {
    const unspent = this.getUnspentCommitments();

    // Sort by amount descending (prefer using larger commitments first)
    unspent.sort((a, b) => (a.amount > b.amount ? -1 : 1));

    const selected: CommitmentRecord[] = [];
    let totalAmount = 0n;

    for (const commitment of unspent) {
      if (totalAmount >= targetAmount) {
        break;
      }
      selected.push(commitment);
      totalAmount += commitment.amount;
    }

    if (totalAmount < targetAmount) {
      throw new Error(`Insufficient balance. Required: ${targetAmount}, Available: ${totalAmount}`);
    }

    return selected;
  }

  /**
   * Get current Merkle root
   */
  getCurrentRoot(): bigint {
    if (!this.tree) {
      throw new Error("State manager not initialized");
    }
    return this.tree.getRoot();
  }

  /**
   * Get Merkle proof for a commitment
   */
  async getProofForCommitment(commitment: bigint): Promise<any> {
    if (!this.tree) {
      throw new Error("State manager not initialized");
    }

    const record = this.getCommitment(commitment);
    if (!record) {
      throw new Error("Commitment not found in local state");
    }

    return await this.tree.getProof(record.leafIndex);
  }

  /**
   * Sync state from on-chain events (placeholder for future implementation)
   * In production, this would listen to Solana logs/events and update the tree
   */
  async syncFromChain(): Promise<void> {
    // TODO: Implement event listening and tree sync
    // This would:
    // 1. Fetch DepositEvent logs from the program
    // 2. For each deposit, insert commitment into tree
    // 3. Update local state with on-chain commitments
    // 4. Handle tree reorgs if necessary
    console.warn("syncFromChain not yet implemented. Using local-only state management.");
  }

  /**
   * Export state to JSON for persistence
   */
  exportState(): string {
    const state = {
      commitments: Array.from(this.commitments.entries()),
      nullifierSecrets: Array.from(this.nullifierSecrets.entries()).map(([k, v]) => [
        k,
        v.toString(),
      ]),
      treeDepth: this.tree?.getLeafCount() ?? 0,
    };
    return JSON.stringify(state);
  }

  /**
   * Import state from JSON
   */
  async importState(json: string): Promise<void> {
    const state = JSON.parse(json);

    // Restore commitments
    this.commitments = new Map(state.commitments);

    // Restore nullifier secrets
    this.nullifierSecrets = new Map(
      state.nullifierSecrets.map(([k, v]: [string, string]) => [k, BigInt(v)]),
    );

    // Rebuild Merkle tree from commitments
    if (!this.tree) {
      await this.init();
    }

    // Sort commitments by leaf index and insert into tree
    const sortedCommitments = Array.from(this.commitments.values()).sort(
      (a, b) => a.leafIndex - b.leafIndex,
    );

    for (const record of sortedCommitments) {
      await this.tree!.insert(record.commitment);
    }
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.commitments.clear();
    this.nullifierSecrets.clear();
    this.tree = null;
  }
}

/**
 * Create and initialize a state manager
 */
export async function createStateManager(treeDepth: number = TREE_DEPTH): Promise<StateManager> {
  const manager = new StateManager();
  await manager.init(treeDepth);
  return manager;
}
