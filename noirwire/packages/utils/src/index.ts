// NoirWire Shared Utilities

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format lamports to SOL
 */
export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / 1_000_000_000;
}

/**
 * Format SOL to lamports
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1_000_000_000));
}

/**
 * Format a number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Shorten a public key or address for display
 */
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// ============================================
// Validation Utilities
// ============================================

/**
 * Check if a string is a valid hex string
 */
export function isValidHex(hex: string): boolean {
  return /^(0x)?[0-9a-fA-F]+$/.test(hex);
}

/**
 * Check if a string is a valid base58 string (Solana addresses)
 */
export function isValidBase58(str: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(str);
}

/**
 * Validate amount is positive and within bounds
 */
export function isValidAmount(amount: bigint | number, maxAmount?: bigint): boolean {
  const bigAmount = typeof amount === "number" ? BigInt(amount) : amount;
  if (bigAmount <= 0n) return false;
  if (maxAmount && bigAmount > maxAmount) return false;
  return true;
}

// ============================================
// Crypto Utilities
// ============================================

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generate a random salt (32 bytes as hex)
 */
export function generateSalt(): string {
  return bytesToHex(randomBytes(32));
}

// ============================================
// Async Utilities
// ============================================

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }

  throw lastError;
}
