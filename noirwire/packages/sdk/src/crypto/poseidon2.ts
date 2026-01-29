/**
 * Poseidon2 hash implementation for NoirWire SDK
 * Uses compiled Noir circuits for guaranteed compatibility
 */

import { Noir } from "@noir-lang/noir_js";
import { BarretenbergBackend } from "@noir-lang/backend_barretenberg";
// @ts-ignore - JSON import
import hashHelper1Circuit from "../../noir-circuits/target/hash_helper_1.json";
// @ts-ignore - JSON import
import hashHelper2Circuit from "../../noir-circuits/target/hash_helper_2.json";
// @ts-ignore - JSON import
import hashHelper3Circuit from "../../noir-circuits/target/hash_helper_3.json";
// @ts-ignore - JSON import
import hashHelper5Circuit from "../../noir-circuits/target/hash_helper.json";

// Singleton instances for different input sizes
let noirHasher1: Noir | null = null;
let hashBackend1: BarretenbergBackend | null = null;
let noirHasher2: Noir | null = null;
let hashBackend2: BarretenbergBackend | null = null;
let noirHasher3: Noir | null = null;
let hashBackend3: BarretenbergBackend | null = null;
let noirHasher5: Noir | null = null;
let hashBackend5: BarretenbergBackend | null = null;

/**
 * Get or initialize Noir hasher for 1 input (owner derivation)
 */
async function getNoirHasher1() {
  if (!noirHasher1) {
    // @ts-ignore - Circuit JSON type mismatch
    hashBackend1 = new BarretenbergBackend(hashHelper1Circuit);
    // @ts-ignore - Circuit JSON type mismatch
    noirHasher1 = new Noir(hashHelper1Circuit);
  }
  return noirHasher1;
}

/**
 * Get or initialize Noir hasher for 2 inputs (merkle trees)
 */
async function getNoirHasher2() {
  if (!noirHasher2) {
    // @ts-ignore - Circuit JSON type mismatch
    hashBackend2 = new BarretenbergBackend(hashHelper2Circuit);
    // @ts-ignore - Circuit JSON type mismatch
    noirHasher2 = new Noir(hashHelper2Circuit);
  }
  return noirHasher2;
}

/**
 * Get or initialize Noir hasher for 3 inputs (nullifiers)
 */
async function getNoirHasher3() {
  if (!noirHasher3) {
    // @ts-ignore - Circuit JSON type mismatch
    hashBackend3 = new BarretenbergBackend(hashHelper3Circuit);
    // @ts-ignore - Circuit JSON type mismatch
    noirHasher3 = new Noir(hashHelper3Circuit);
  }
  return noirHasher3;
}

/**
 * Get or initialize Noir hasher for 5 inputs (commitments)
 */
async function getNoirHasher5() {
  if (!noirHasher5) {
    // @ts-ignore - Circuit JSON type mismatch
    hashBackend5 = new BarretenbergBackend(hashHelper5Circuit);
    // @ts-ignore - Circuit JSON type mismatch
    noirHasher5 = new Noir(hashHelper5Circuit);
  }
  return noirHasher5;
}

/**
 * Domain separator for commitments (matches Noir: COMMITMENT_DOMAIN = 0x01)
 */
export const COMMITMENT_DOMAIN = 1n;

/**
 * Domain separator for nullifiers
 */
export const NULLIFIER_DOMAIN = 2n;

/**
 * Poseidon2 hash using Noir's exact implementation via compiled circuit
 *
 * This executes the compiled Noir hash_helper circuit to compute Poseidon2 hashes,
 * guaranteeing 100% compatibility with circuit computations.
 */

// Cache for performance
const NOIR_POSEIDON2_CACHE: Map<string, bigint> = new Map();

export async function poseidon2Hash(inputs: bigint[]): Promise<bigint> {
  // Support 1, 2, 3, and 5 inputs
  const supportedLengths = [1, 2, 3, 5];
  if (!supportedLengths.includes(inputs.length)) {
    throw new Error(
      `poseidon2Hash supports 1, 2, 3, or 5 inputs (got ${inputs.length}). ` +
        "Add more hash_helper circuits for other lengths.",
    );
  }

  // Create cache key
  const key = inputs.join(",");

  // Check cache
  if (NOIR_POSEIDON2_CACHE.has(key)) {
    return NOIR_POSEIDON2_CACHE.get(key)!;
  }

  // Select appropriate circuit based on input length
  let noir: Noir;
  switch (inputs.length) {
    case 1:
      noir = await getNoirHasher1();
      break;
    case 2:
      noir = await getNoirHasher2();
      break;
    case 3:
      noir = await getNoirHasher3();
      break;
    case 5:
      noir = await getNoirHasher5();
      break;
    default:
      throw new Error(`Unsupported input length: ${inputs.length}`);
  }

  // Prepare inputs as hex strings (Noir format)
  const inputsHex = inputs.map((i) => "0x" + i.toString(16));

  // Execute circuit
  // @ts-ignore - Backend signature mismatch
  const { returnValue } = await noir.execute({ inputs: inputsHex });

  // Parse result
  const hash = BigInt(returnValue as string);

  // Cache it
  NOIR_POSEIDON2_CACHE.set(key, hash);

  return hash;
}

/**
 * Poseidon2 hash for two elements (optimized for merkle tree)
 */
export async function poseidon2HashPair(left: bigint, right: bigint): Promise<bigint> {
  return poseidon2Hash([left, right]);
}

/**
 * Balance structure matching Noir's Balance struct
 */
export interface Balance {
  owner: bigint;
  amount: bigint;
  vaultId: bigint;
  blinding: bigint;
}

/**
 * Compute commitment to a balance
 * commitment = poseidon2(COMMITMENT_DOMAIN, owner, amount, vault_id, blinding)
 * Matches Noir: compute_commitment in primitives/commitment.nr
 */
export async function computeCommitment(balance: Balance): Promise<bigint> {
  return poseidon2Hash([
    COMMITMENT_DOMAIN,
    balance.owner,
    balance.amount,
    balance.vaultId,
    balance.blinding,
  ]);
}

/**
 * Compute commitment as bytes (for Solana)
 */
export async function computeCommitmentBytes(balance: Balance): Promise<Uint8Array> {
  const commitment = await computeCommitment(balance);
  return bigintToBytes32(commitment);
}

/**
 * Compute nullifier for spending a commitment
 * nullifier = poseidon2(commitment, nullifier_secret, nonce)
 * Matches Noir: compute_nullifier in primitives/nullifier.nr
 */
export async function computeNullifier(
  commitment: bigint,
  nullifierSecret: bigint,
  nonce: bigint,
): Promise<bigint> {
  return poseidon2Hash([commitment, nullifierSecret, nonce]);
}

/**
 * Compute nullifier as bytes (for Solana)
 */
export async function computeNullifierBytes(
  commitment: bigint,
  nullifierSecret: bigint,
  nonce: bigint,
): Promise<Uint8Array> {
  const nullifier = await computeNullifier(commitment, nullifierSecret, nonce);
  return bigintToBytes32(nullifier);
}

/**
 * Derive owner identifier from secret key
 * owner = poseidon2(secret_key)
 * Matches Noir: derive_owner in primitives/commitment.nr
 */
export async function deriveOwner(secretKey: bigint): Promise<bigint> {
  return poseidon2Hash([secretKey]);
}

/**
 * Convert bigint to 32-byte array (big-endian)
 */
export function bigintToBytes32(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

/**
 * Convert 32-byte array to bigint (big-endian)
 * Automatically reduces modulo BN254 field to ensure valid field element
 */
export function bytes32ToBigint(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new Error("Expected 32 bytes");
  }
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  const value = BigInt(hex);
  // Reduce modulo field modulus to ensure it's a valid field element
  return value % BN254_FIELD_MODULUS;
}

/**
 * BN254 field modulus (the prime used by the BN254 curve)
 * All field elements must be less than this value
 */
export const BN254_FIELD_MODULUS =
  0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

/**
 * Generate random field element (properly reduced modulo BN254 field)
 * This ensures the value is always valid for Noir circuits
 */
export function generateFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const randomBigint = bytes32ToBigint(bytes);
  // Reduce modulo field modulus to ensure it's a valid field element
  return randomBigint % BN254_FIELD_MODULUS;
}

/**
 * Generate random blinding factor (field element)
 */
export function generateBlinding(): bigint {
  return generateFieldElement();
}

/**
 * Generate random nullifier secret (field element)
 */
export function generateNullifierSecret(): bigint {
  return generateFieldElement();
}

/**
 * Cleanup resources (call on app shutdown)
 */
export async function cleanup(): Promise<void> {
  if (hashBackend2) {
    await hashBackend2.destroy();
    hashBackend2 = null;
    noirHasher2 = null;
  }
  if (hashBackend5) {
    await hashBackend5.destroy();
    hashBackend5 = null;
    noirHasher5 = null;
  }
}
