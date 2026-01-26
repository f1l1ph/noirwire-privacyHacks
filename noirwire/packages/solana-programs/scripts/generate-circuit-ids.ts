/**
 * Circuit ID Generator for Noirwire
 *
 * This script generates the proper circuit IDs by hashing:
 *   keccak256("noirwire.{circuit_name}.{version}")
 *
 * Run with: yarn ts-node scripts/generate-circuit-ids.ts
 */

import { keccak_256 } from "@noble/hashes/sha3.js";

interface CircuitInfo {
  name: string;
  version: string;
  description: string;
}

const CIRCUITS: CircuitInfo[] = [
  {
    name: "deposit",
    version: "v2",
    description: "Deposit circuit: proves creation of a private balance commitment",
  },
  {
    name: "withdraw",
    version: "v2",
    description: "Withdraw circuit: proves valid withdrawal from private to public",
  },
  {
    name: "transfer",
    version: "v2",
    description: "Transfer circuit: proves valid private-to-private transfer",
  },
  {
    name: "batch_settlement",
    version: "v2",
    description: "Batch settlement circuit: proves valid batch of nullifiers",
  },
];

function computeCircuitId(circuitName: string, version: string): string {
  const input = `noirwire.${circuitName}.${version}`;
  const encoder = new TextEncoder();
  const hash = keccak_256(encoder.encode(input));
  return "0x" + Buffer.from(hash).toString("hex");
}

function formatAsRustArray(hexString: string): string {
  // Remove 0x prefix
  const hex = hexString.slice(2);
  const bytes: string[] = [];

  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(`0x${hex.slice(i, i + 2)}`);
  }

  // Format as Rust array with 15 bytes per line
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 15) {
    lines.push("        " + bytes.slice(i, i + 15).join(", ") + ",");
  }

  return lines.join("\n");
}

function main() {
  console.log("═".repeat(70));
  console.log("Noirwire Circuit ID Generator");
  console.log("═".repeat(70));
  console.log("");
  console.log("Generated circuit IDs for proof.rs:");
  console.log("");

  for (const circuit of CIRCUITS) {
    const id = computeCircuitId(circuit.name, circuit.version);
    const rustArray = formatAsRustArray(id);
    const inputString = `noirwire.${circuit.name}.${circuit.version}`;

    console.log(`/// ${circuit.description}`);
    console.log(`/// Generated from: keccak256("${inputString}")`);
    console.log(`pub const ${circuit.name.toUpperCase()}: [u8; 32] = [`);
    console.log(rustArray);
    console.log("];");
    console.log("");
  }

  console.log("═".repeat(70));
  console.log("");
  console.log("Verification (input -> hash):");
  console.log("");

  for (const circuit of CIRCUITS) {
    const inputString = `noirwire.${circuit.name}.${circuit.version}`;
    const id = computeCircuitId(circuit.name, circuit.version);
    console.log(`  ${inputString}`);
    console.log(`  -> ${id}`);
    console.log("");
  }
}

main();
