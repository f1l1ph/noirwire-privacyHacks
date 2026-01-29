/**
 * NoirWire SDK - ZK Proof Generator
 * Generates Groth16 proofs for deposit, withdraw, and transfer operations
 */

// Lazy imports to avoid loading WASM during module initialization
import type { CompiledCircuit } from "@noir-lang/backend_barretenberg";
import { MerkleProof, proofToNoirFormat } from "../crypto/merkle";
import { Balance, bigintToBytes32 } from "../crypto/poseidon2";

/**
 * Groth16 proof structure for Solana verification
 * Total: 256 bytes
 */
export interface Groth16Proof {
  a: Uint8Array; // 64 bytes - G1 point (uncompressed)
  b: Uint8Array; // 128 bytes - G2 point (uncompressed)
  c: Uint8Array; // 64 bytes - G1 point (uncompressed)
}

/**
 * Proof result with proof data and public inputs
 */
export interface ProofResult {
  proof: Groth16Proof;
  publicInputs: string[];
  rawProof: Uint8Array;
}

/**
 * Deposit witness structure matching Noir circuit
 */
export interface DepositWitness {
  // Public inputs
  depositAmount: bigint;
  newCommitment: bigint;
  leafIndex: number;
  oldRoot: bigint;
  newRoot: bigint;

  // Private inputs
  owner: bigint;
  vaultId: bigint;
  blinding: bigint;
  insertionProof: MerkleProof;
}

/**
 * Withdraw witness structure matching Noir circuit
 */
export interface WithdrawWitness {
  // Public inputs
  amount: bigint;
  recipient: bigint;
  nullifier: bigint;
  oldRoot: bigint;
  newRoot: bigint;

  // Private inputs
  owner: bigint;
  balance: bigint;
  vaultId: bigint;
  blinding: bigint;
  merkleProof: MerkleProof;
  leafIndex: number;
  nullifierSecret: bigint;
  nonce: bigint;
  newBalanceBlinding: bigint;
  newBalanceLeafIndex: number;
  newBalanceProof: MerkleProof;
}

/**
 * Transfer witness structure matching Noir circuit
 */
export interface TransferWitness {
  // Public inputs
  nullifier: bigint;
  oldRoot: bigint;
  newRoot: bigint;

  // Sender private inputs
  senderOwner: bigint;
  senderAmount: bigint;
  senderVaultId: bigint;
  senderBlinding: bigint;
  senderSecret: bigint;
  senderProof: MerkleProof;
  senderLeafIndex: number;

  // Transfer details
  transferAmount: bigint;
  nonce: bigint;

  // Receiver private inputs
  receiverOwner: bigint;
  receiverVaultId: bigint;
  receiverBlinding: bigint;
  receiverLeafIndex: number;
  receiverProof: MerkleProof;

  // New sender balance
  newSenderBlinding: bigint;
  newSenderLeafIndex: number;
  newSenderProof: MerkleProof;
}

/**
 * Proof Generator class
 * Manages circuit compilation and proof generation
 */
export class ProofGenerator {
  private backend: any = null;
  private noir: any = null;
  private circuit: CompiledCircuit;
  private noirModule: any = null;
  private backendModule: any = null;

  constructor(circuit: CompiledCircuit) {
    this.circuit = circuit;
  }

  /**
   * Initialize the prover (lazy initialization with dynamic imports)
   */
  private async init(): Promise<{ noir: any; backend: any }> {
    if (!this.backend) {
      // Lazy load backend module
      if (!this.backendModule) {
        this.backendModule = await import("@noir-lang/backend_barretenberg");
      }
      this.backend = new this.backendModule.BarretenbergBackend(this.circuit);
    }
    if (!this.noir) {
      // Lazy load Noir module
      if (!this.noirModule) {
        this.noirModule = await import("@noir-lang/noir_js");
      }
      this.noir = new this.noirModule.Noir(this.circuit);
    }
    return { noir: this.noir, backend: this.backend };
  }

  /**
   * Generate a deposit proof
   */
  async generateDepositProof(witness: DepositWitness): Promise<ProofResult> {
    const { noir, backend } = await this.init();

    const noirProof = proofToNoirFormat(witness.insertionProof);

    // Prepare inputs matching Noir circuit structure (flat, not nested)
    const inputs = {
      deposit_amount: witness.depositAmount.toString(),
      new_commitment: witness.newCommitment.toString(),
      leaf_index: witness.leafIndex.toString(),
      old_root: witness.oldRoot.toString(),
      new_root: witness.newRoot.toString(),
      private_inputs: {
        owner: witness.owner.toString(),
        vault_id: witness.vaultId.toString(),
        blinding: witness.blinding.toString(),
        insertion_proof: {
          siblings: noirProof.siblings,
          path_indices: noirProof.path_indices,
        },
      },
    };

    console.log("[ProofGenerator] Executing circuit with inputs:", {
      deposit_amount: inputs.deposit_amount,
      new_commitment: inputs.new_commitment,
      leaf_index: inputs.leaf_index,
      old_root: inputs.old_root,
      new_root: inputs.new_root,
      private_inputs: {
        owner: inputs.private_inputs.owner,
        vault_id: inputs.private_inputs.vault_id,
        blinding: inputs.private_inputs.blinding,
        siblings_count: inputs.private_inputs.insertion_proof.siblings.length,
        first_3_siblings: inputs.private_inputs.insertion_proof.siblings.slice(0, 3),
        first_3_indices: inputs.private_inputs.insertion_proof.path_indices.slice(0, 3),
      },
    });

    // Execute the circuit to generate witness
    console.log("[ProofGenerator] Calling noir.execute()...");
    const { witness: solvedWitness } = await noir.execute(inputs);

    // Generate proof
    const proofData = await backend.generateProof(solvedWitness);

    // Parse proof into Solana format
    const proof = this.parseProofForSolana(proofData.proof);

    return {
      proof,
      publicInputs: proofData.publicInputs.map((pi: { toString: () => string }) => pi.toString()),
      rawProof: proofData.proof,
    };
  }

  /**
   * Generate a withdraw proof
   */
  async generateWithdrawProof(witness: WithdrawWitness): Promise<ProofResult> {
    const { noir, backend } = await this.init();

    const merkleProof = proofToNoirFormat(witness.merkleProof);
    const newBalanceProof = proofToNoirFormat(witness.newBalanceProof);

    // Prepare inputs matching Noir circuit structure (flat, not nested)
    const inputs = {
      amount: witness.amount.toString(),
      recipient: witness.recipient.toString(),
      nullifier: witness.nullifier.toString(),
      old_root: witness.oldRoot.toString(),
      new_root: witness.newRoot.toString(),
      private_inputs: {
        owner: witness.owner.toString(),
        balance: witness.balance.toString(),
        vault_id: witness.vaultId.toString(),
        blinding: witness.blinding.toString(),
        merkle_proof: {
          siblings: merkleProof.siblings,
          path_indices: merkleProof.path_indices,
        },
        leaf_index: witness.leafIndex.toString(),
        nullifier_secret: witness.nullifierSecret.toString(),
        nonce: witness.nonce.toString(),
        new_balance_blinding: witness.newBalanceBlinding.toString(),
        new_balance_leaf_index: witness.newBalanceLeafIndex.toString(),
        new_balance_proof: {
          siblings: newBalanceProof.siblings,
          path_indices: newBalanceProof.path_indices,
        },
      },
    };

    // Execute and generate proof
    const { witness: solvedWitness } = await noir.execute(inputs);
    const proofData = await backend.generateProof(solvedWitness);
    const proof = this.parseProofForSolana(proofData.proof);

    return {
      proof,
      publicInputs: proofData.publicInputs.map((pi: { toString: () => string }) => pi.toString()),
      rawProof: proofData.proof,
    };
  }

  /**
   * Generate a transfer proof
   */
  async generateTransferProof(witness: TransferWitness): Promise<ProofResult> {
    const { noir, backend } = await this.init();

    const senderProof = proofToNoirFormat(witness.senderProof);
    const receiverProof = proofToNoirFormat(witness.receiverProof);
    const newSenderProof = proofToNoirFormat(witness.newSenderProof);

    // Prepare inputs matching Noir circuit structure (flat, not nested)
    const inputs = {
      nullifier: witness.nullifier.toString(),
      old_root: witness.oldRoot.toString(),
      new_root: witness.newRoot.toString(),
      private_inputs: {
        sender_owner: witness.senderOwner.toString(),
        sender_amount: witness.senderAmount.toString(),
        sender_vault_id: witness.senderVaultId.toString(),
        sender_blinding: witness.senderBlinding.toString(),
        sender_secret: witness.senderSecret.toString(),
        sender_proof: {
          siblings: senderProof.siblings,
          path_indices: senderProof.path_indices,
        },
        sender_leaf_index: witness.senderLeafIndex.toString(),
        transfer_amount: witness.transferAmount.toString(),
        nonce: witness.nonce.toString(),
        receiver_owner: witness.receiverOwner.toString(),
        receiver_vault_id: witness.receiverVaultId.toString(),
        receiver_blinding: witness.receiverBlinding.toString(),
        receiver_leaf_index: witness.receiverLeafIndex.toString(),
        receiver_proof: {
          siblings: receiverProof.siblings,
          path_indices: receiverProof.path_indices,
        },
        new_sender_blinding: witness.newSenderBlinding.toString(),
        new_sender_leaf_index: witness.newSenderLeafIndex.toString(),
        new_sender_proof: {
          siblings: newSenderProof.siblings,
          path_indices: newSenderProof.path_indices,
        },
      },
    };

    // Execute and generate proof
    const { witness: solvedWitness } = await noir.execute(inputs);
    const proofData = await backend.generateProof(solvedWitness);
    const proof = this.parseProofForSolana(proofData.proof);

    return {
      proof,
      publicInputs: proofData.publicInputs.map((pi: { toString: () => string }) => pi.toString()),
      rawProof: proofData.proof,
    };
  }

  /**
   * Verify a proof locally (for testing)
   */
  async verifyProof(proof: Uint8Array, publicInputs: string[]): Promise<boolean> {
    const { backend } = await this.init();
    return backend.verifyProof({
      proof,
      publicInputs: publicInputs.map((pi) => pi),
    });
  }

  /**
   * Get the verification key
   */
  async getVerificationKey(): Promise<Uint8Array> {
    const { backend } = await this.init();
    return backend.getVerificationKey();
  }

  /**
   * Parse Barretenberg proof into Solana-compatible Groth16 format
   * Groth16 proofs: A (G1 64 bytes), B (G2 128 bytes), C (G1 64 bytes)
   */
  private parseProofForSolana(proofBytes: Uint8Array): Groth16Proof {
    // Barretenberg outputs proof in specific format
    // The exact offsets depend on the proof system - this is for UltraHonk/Groth16
    return {
      a: proofBytes.slice(0, 64),
      b: proofBytes.slice(64, 192),
      c: proofBytes.slice(192, 256),
    };
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.backend) {
      await this.backend.destroy();
      this.backend = null;
    }
    this.noir = null;
  }
}

/**
 * Load a compiled circuit from JSON
 */
export function loadCircuit(circuitJson: unknown): CompiledCircuit {
  return circuitJson as CompiledCircuit;
}

/**
 * Convert Groth16Proof to flat byte array for Solana instruction
 */
export function proofToBytes(proof: Groth16Proof): Uint8Array {
  const result = new Uint8Array(256);
  result.set(proof.a, 0);
  result.set(proof.b, 64);
  result.set(proof.c, 192);
  return result;
}

/**
 * Convert flat byte array back to Groth16Proof
 */
export function bytesToProof(bytes: Uint8Array): Groth16Proof {
  if (bytes.length !== 256) {
    throw new Error(`Expected 256 bytes, got ${bytes.length}`);
  }
  return {
    a: bytes.slice(0, 64),
    b: bytes.slice(64, 192),
    c: bytes.slice(192, 256),
  };
}

/**
 * Format public inputs for Solana verification
 * Converts string bigints to 32-byte arrays
 */
export function formatPublicInputsForSolana(publicInputs: string[]): Uint8Array[] {
  return publicInputs.map((pi) => {
    const bigint = BigInt(pi);
    return bigintToBytes32(bigint);
  });
}
