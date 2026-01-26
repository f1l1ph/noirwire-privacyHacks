/**
 * NoirWire SDK - Compiled Circuit Loader
 * Loads pre-compiled Noir circuits for proof generation
 */

import type { CompiledCircuit } from "@noir-lang/backend_barretenberg";

// Import compiled circuits from noir-circuits package
// These are the JSON artifacts produced by `nargo compile`
import depositCircuit from "../../../noir-circuits/target/deposit.json";
import withdrawCircuit from "../../../noir-circuits/target/withdraw.json";
import transferCircuit from "../../../noir-circuits/target/transfer.json";

/**
 * Get the compiled deposit circuit
 */
export function getDepositCircuit(): CompiledCircuit {
  return depositCircuit as CompiledCircuit;
}

/**
 * Get the compiled withdraw circuit
 */
export function getWithdrawCircuit(): CompiledCircuit {
  return withdrawCircuit as CompiledCircuit;
}

/**
 * Get the compiled transfer circuit
 */
export function getTransferCircuit(): CompiledCircuit {
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
      this.depositCircuit = depositCircuit as CompiledCircuit;
    }
    return this.depositCircuit;
  }

  /**
   * Get withdraw circuit (cached)
   */
  static getWithdrawCircuit(): CompiledCircuit {
    if (!this.withdrawCircuit) {
      this.withdrawCircuit = withdrawCircuit as CompiledCircuit;
    }
    return this.withdrawCircuit;
  }

  /**
   * Get transfer circuit (cached)
   */
  static getTransferCircuit(): CompiledCircuit {
    if (!this.transferCircuit) {
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
