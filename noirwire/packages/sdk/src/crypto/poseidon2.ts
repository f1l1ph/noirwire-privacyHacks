/**
 * Poseidon2 hash implementation for NoirWire SDK
 * Matches the Noir circuit implementation for cross-compatibility
 */

// Lazy import to avoid loading WASM files during module initialization
let barretenbergModule: any = null;
let barretenbergInstance: any = null;

/**
 * Get or initialize Barretenberg instance (singleton pattern)
 * Lazy loads the module and WASM to avoid blocking app startup
 */
async function getBarretenberg(): Promise<any> {
  if (!barretenbergInstance) {
    // Dynamically import only when first needed
    if (!barretenbergModule) {
      barretenbergModule = await import("@aztec/bb.js");
    }
    barretenbergInstance = await barretenbergModule.Barretenberg.new();
  }
  return barretenbergInstance;
}

/**
 * Get the Fr class from Barretenberg (lazy loaded)
 */
async function getFr(): Promise<any> {
  if (!barretenbergModule) {
    barretenbergModule = await import("@aztec/bb.js");
  }
  return barretenbergModule.Fr;
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
 * Poseidon2 hash using Barretenberg
 * This is the native Aztec/Noir Poseidon2 implementation
 */
export async function poseidon2Hash(inputs: bigint[]): Promise<bigint> {
  const bb = await getBarretenberg();
  const Fr = await getFr();
  const frInputs = inputs.map((i) => new Fr(i));
  const result = await bb.poseidon2Hash(frInputs);
  // Fr has toString() method, convert via hex
  return BigInt(result.toString());
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
 */
export function bytes32ToBigint(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new Error("Expected 32 bytes");
  }
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

/**
 * Generate random blinding factor (256-bit)
 */
export function generateBlinding(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes32ToBigint(bytes);
}

/**
 * Generate random nullifier secret (256-bit)
 */
export function generateNullifierSecret(): bigint {
  return generateBlinding();
}

/**
 * Cleanup Barretenberg instance (call on app shutdown)
 */
export async function cleanup(): Promise<void> {
  if (barretenbergInstance) {
    await barretenbergInstance.destroy();
    barretenbergInstance = null;
  }
}
