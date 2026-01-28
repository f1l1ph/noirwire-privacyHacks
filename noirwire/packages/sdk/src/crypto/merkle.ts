/**
 * Merkle Tree implementation for NoirWire SDK
 * Matches the Noir circuit implementation for cross-compatibility
 */

import { poseidon2HashPair } from "./poseidon2";

/**
 * Tree depth - must match Noir circuit (TREE_DEPTH in primitives/merkle.nr)
 * Test: 3 (supports 8 leaves)
 * Production: 24 (supports 16,777,216 leaves)
 */
export const TREE_DEPTH = 24;

/**
 * Zero value for empty leaves
 */
export const ZERO_VALUE = 0n;

/**
 * Merkle proof structure matching Noir's MerkleProof struct
 */
export interface MerkleProof {
  siblings: bigint[];
  pathIndices: number[]; // 0 = left, 1 = right
}

/**
 * Merkle Tree class with efficient proof generation
 */
export class MerkleTree {
  private depth: number;
  private levels: Map<number, bigint>[];
  private zeroValues: bigint[];
  private leafCount: number = 0;

  constructor(depth: number = TREE_DEPTH) {
    this.depth = depth;
    this.levels = Array.from({ length: depth + 1 }, () => new Map());
    this.zeroValues = [];
  }

  /**
   * Initialize the tree (must be called before use)
   */
  async init(): Promise<void> {
    await this.computeZeroValues();
  }

  /**
   * Pre-compute zero values for empty subtrees at each level
   */
  private async computeZeroValues(): Promise<void> {
    let current = ZERO_VALUE;
    this.zeroValues = [current];

    for (let i = 0; i < this.depth; i++) {
      current = await poseidon2HashPair(current, current);
      this.zeroValues.push(current);
    }
  }

  /**
   * Get zero value at a given level
   */
  getZeroValue(level: number): bigint {
    return this.zeroValues[level] ?? ZERO_VALUE;
  }

  /**
   * Insert a leaf and return the new root and proof
   */
  async insert(leaf: bigint): Promise<{
    root: bigint;
    index: number;
    proof: MerkleProof;
  }> {
    const index = this.leafCount++;
    this.levels[0]!.set(index, leaf);

    // Recompute path to root and collect siblings
    let currentIndex = index;
    let currentHash = leaf;
    const siblings: bigint[] = [];
    const pathIndices: number[] = [];

    for (let level = 0; level < this.depth; level++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      // Get sibling (use zero value if doesn't exist)
      const sibling = this.levels[level]!.get(siblingIndex) ?? this.zeroValues[level]!;
      siblings.push(sibling);
      pathIndices.push(isRight ? 1 : 0);

      // Compute parent hash
      const [left, right] = isRight ? [sibling, currentHash] : [currentHash, sibling];
      currentHash = await poseidon2HashPair(left, right);

      // Move to parent
      currentIndex = Math.floor(currentIndex / 2);
      this.levels[level + 1]!.set(currentIndex, currentHash);
    }

    return {
      root: currentHash,
      index,
      proof: { siblings, pathIndices },
    };
  }

  /**
   * Update a leaf at a given index
   */
  async update(
    index: number,
    newLeaf: bigint,
  ): Promise<{
    oldRoot: bigint;
    newRoot: bigint;
    proof: MerkleProof;
  }> {
    if (index >= this.leafCount) {
      throw new Error(`Index ${index} out of bounds (leafCount: ${this.leafCount})`);
    }

    // Get old root first
    const oldRoot = this.getRoot();

    // Get proof before update (for the old leaf)
    const proof = await this.getProof(index);

    // Update the leaf
    this.levels[0]!.set(index, newLeaf);

    // Recompute path to root
    let currentIndex = index;
    let currentHash = newLeaf;

    for (let level = 0; level < this.depth; level++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      const sibling = this.levels[level]!.get(siblingIndex) ?? this.zeroValues[level]!;

      const [left, right] = isRight ? [sibling, currentHash] : [currentHash, sibling];
      currentHash = await poseidon2HashPair(left, right);

      currentIndex = Math.floor(currentIndex / 2);
      this.levels[level + 1]!.set(currentIndex, currentHash);
    }

    return {
      oldRoot,
      newRoot: currentHash,
      proof,
    };
  }

  /**
   * Get the current root
   */
  getRoot(): bigint {
    return this.levels[this.depth]!.get(0) ?? this.zeroValues[this.depth]!;
  }

  /**
   * Get proof for a leaf at a given index
   */
  async getProof(index: number): Promise<MerkleProof> {
    if (index >= this.leafCount) {
      throw new Error(`Index ${index} out of bounds (leafCount: ${this.leafCount})`);
    }

    const siblings: bigint[] = [];
    const pathIndices: number[] = [];
    let currentIndex = index;

    for (let level = 0; level < this.depth; level++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      const sibling = this.levels[level]!.get(siblingIndex) ?? this.zeroValues[level]!;
      siblings.push(sibling);
      pathIndices.push(isRight ? 1 : 0);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { siblings, pathIndices };
  }

  /**
   * Get leaf at a given index
   */
  getLeaf(index: number): bigint {
    return this.levels[0]!.get(index) ?? ZERO_VALUE;
  }

  /**
   * Get the number of leaves inserted
   */
  getLeafCount(): number {
    return this.leafCount;
  }

  /**
   * Verify a merkle proof
   */
  async verifyProof(leaf: bigint, proof: MerkleProof, expectedRoot: bigint): Promise<boolean> {
    let currentHash = leaf;

    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i]!;
      const isRight = proof.pathIndices[i] === 1;

      const [left, right] = isRight ? [sibling, currentHash] : [currentHash, sibling];
      currentHash = await poseidon2HashPair(left, right);
    }

    return currentHash === expectedRoot;
  }

  /**
   * Compute root from leaf and proof (without modifying tree)
   */
  async computeRoot(leaf: bigint, proof: MerkleProof): Promise<bigint> {
    let currentHash = leaf;

    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i]!;
      const isRight = proof.pathIndices[i] === 1;

      const [left, right] = isRight ? [sibling, currentHash] : [currentHash, sibling];
      currentHash = await poseidon2HashPair(left, right);
    }

    return currentHash;
  }
}

/**
 * Create and initialize a new Merkle tree
 */
export async function createMerkleTree(depth: number = TREE_DEPTH): Promise<MerkleTree> {
  const tree = new MerkleTree(depth);
  await tree.init();
  return tree;
}

/**
 * Convert MerkleProof to format expected by Noir circuits
 * Noir expects decimal string representations of Field elements
 */
export function proofToNoirFormat(proof: MerkleProof): {
  siblings: string[];
  path_indices: string[];
} {
  return {
    siblings: proof.siblings.map((s) => s.toString()),
    path_indices: proof.pathIndices.map((p) => p.toString()),
  };
}

/**
 * Convert MerkleProof to Solana-compatible byte arrays
 */
export function proofToSolanaFormat(proof: MerkleProof): {
  siblings: Uint8Array[];
  pathIndices: number[];
} {
  return {
    siblings: proof.siblings.map((s) => {
      const hex = s.toString(16).padStart(64, "0");
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }),
    pathIndices: proof.pathIndices,
  };
}
