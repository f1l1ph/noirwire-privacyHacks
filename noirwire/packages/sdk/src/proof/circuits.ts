/**
 * NoirWire SDK - Compiled Circuit Loader
 * Loads pre-compiled Noir circuits for proof generation
 */

import type { CompiledCircuit } from "@noir-lang/backend_barretenberg";

// Import compiled circuits from noir-circuits package
// These are the JSON artifacts produced by `nargo compile`
import depositCircuitJson from "../../../noir-circuits/target/deposit.json";
import withdrawCircuitJson from "../../../noir-circuits/target/withdraw.json";
import transferCircuitJson from "../../../noir-circuits/target/transfer.json";

// Assign the imported circuits
const depositCircuit = depositCircuitJson;
const withdrawCircuit = withdrawCircuitJson;
const transferCircuit = transferCircuitJson;

/**
 * Get the compiled deposit circuit
 */
export function getDepositCircuit(): CompiledCircuit {
  if (!depositCircuit) {
    throw new Error("Deposit circuit not loaded. Circuit JSON file may be missing.");
  }
  return depositCircuit as CompiledCircuit;
}

/**
 * Get the compiled withdraw circuit
 */
export function getWithdrawCircuit(): CompiledCircuit {
  if (!withdrawCircuit) {
    throw new Error("Withdraw circuit not loaded. Circuit JSON file may be missing.");
  }
  return withdrawCircuit as CompiledCircuit;
}

/**
 * Get the compiled transfer circuit
 */
export function getTransferCircuit(): CompiledCircuit {
  if (!transferCircuit) {
    throw new Error("Transfer circuit not loaded. Circuit JSON file may be missing.");
  }
  return transferCircuit as CompiledCircuit;
}

/**
 * Circuit registry for lazy loading
 */
export class CircuitRegistry {
  private static depositCircuit: CompiledCircuit | null = null;
  private static withdrawCircuit: CompiledCircuit | null = null;
  private static transferCircuit: CompiledCircuit | null = null;

  /**
   * Get deposit circuit (cached)
   */
  static getDepositCircuit(): CompiledCircuit {
    if (!this.depositCircuit) {
      if (!depositCircuit) {
        throw new Error("Deposit circuit not loaded. Circuit JSON file may be missing.");
      }
      this.depositCircuit = depositCircuit as CompiledCircuit;
    }
    return this.depositCircuit;
  }

  /**
   * Get withdraw circuit (cached)
   */
  static getWithdrawCircuit(): CompiledCircuit {
    if (!this.withdrawCircuit) {
      if (!withdrawCircuit) {
        throw new Error("Withdraw circuit not loaded. Circuit JSON file may be missing.");
      }
      this.withdrawCircuit = withdrawCircuit as CompiledCircuit;
    }
    return this.withdrawCircuit;
  }

  /**
   * Get transfer circuit (cached)
   */
  static getTransferCircuit(): CompiledCircuit {
    if (!this.transferCircuit) {
      if (!transferCircuit) {
        throw new Error("Transfer circuit not loaded. Circuit JSON file may be missing.");
      }
      this.transferCircuit = transferCircuit as CompiledCircuit;
    }
    return this.transferCircuit;
  }

  /**
   * Clear circuit cache (for testing)
   */
  static clearCache(): void {
    this.depositCircuit = null;
    this.withdrawCircuit = null;
    this.transferCircuit = null;
  }
}
