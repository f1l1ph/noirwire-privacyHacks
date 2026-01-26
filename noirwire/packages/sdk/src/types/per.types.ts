/**
 * NoirWire SDK - PER Types
 *
 * Type definitions for PER (Private Execution Runtime) client with wallet-based authentication
 */

import type { PublicKey } from "@solana/web3.js";

/**
 * Wallet signer interface for signature generation
 * Compatible with Solana wallet adapters (Phantom, Solflare, etc.)
 */
export interface WalletSigner {
  /**
   * Public key of the wallet
   */
  publicKey: PublicKey;

  /**
   * Sign a message with the wallet's private key
   * @param message - Message bytes to sign
   * @returns Promise resolving to the signature bytes
   */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Token manager for handling auth token lifecycle
 */
export interface TokenManager {
  /**
   * Current authentication token
   */
  token: string | null;

  /**
   * Token expiration timestamp (milliseconds)
   */
  expiresAt: number | null;

  /**
   * Check if token is expired or will expire within buffer seconds
   * @param bufferSeconds - Seconds before expiry to consider token stale (default: 60)
   */
  isExpired(bufferSeconds?: number): boolean;

  /**
   * Clear the current token
   */
  clear(): void;

  /**
   * Set a new token
   * @param token - Authentication token
   * @param ttlSeconds - Time to live in seconds (default: 3600)
   */
  setToken(token: string, ttlSeconds?: number): void;
}

/**
 * PER authentication options
 */
export interface PERAuthOptions {
  /**
   * Wallet signer for generating authentication signatures
   */
  wallet: WalletSigner;

  /**
   * Whether to verify TEE RPC integrity before authentication
   * @default true
   */
  verifyIntegrity?: boolean;

  /**
   * Token time-to-live in seconds
   * @default 3600 (1 hour)
   */
  tokenTTL?: number;

  /**
   * Automatically refresh token when it expires
   * @default true
   */
  autoRefresh?: boolean;
}

/**
 * Token refresh callback
 */
export type TokenRefreshCallback = (newToken: string, expiresAt: number) => void;

/**
 * PER authentication error
 */
export class PERAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PERAuthError";
  }
}

/**
 * TEE integrity verification result
 */
export interface TEEIntegrityResult {
  /**
   * Whether the TEE RPC passed integrity verification
   */
  verified: boolean;

  /**
   * TEE enclave measurement
   */
  measurement?: string;

  /**
   * Verification timestamp
   */
  timestamp: number;

  /**
   * Any error message if verification failed
   */
  error?: string;
}

/**
 * Token generation result
 */
export interface TokenGenerationResult {
  /**
   * Generated authentication token
   */
  token: string;

  /**
   * Token expiration timestamp (milliseconds)
   */
  expiresAt: number;

  /**
   * TEE integrity result (if verification was performed)
   */
  integrity?: TEEIntegrityResult;
}
