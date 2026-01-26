/**
 * NoirWire SDK - PER Client
 *
 * This module provides a client for interacting with MagicBlock's PER (Private Execution Runtime)
 * TEE system for privacy-preserving vault operations with wallet-based authentication.
 *
 * SECURITY REQUIREMENTS:
 * 1. Never send private keys or secrets to PER
 * 2. Verify TEE integrity before authentication (production)
 * 3. Use HTTPS in production environments
 * 4. Implement proper timeout and retry logic
 * 5. Log security-relevant events for audit
 * 6. Use wallet-based authentication (no static API keys)
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { verifyTeeRpcIntegrity, getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import type { PublicKey } from "@solana/web3.js";
import type { PERConfig } from "../config/per.config";
import type {
  WalletSigner,
  TokenManager,
  PERAuthOptions,
  PERAuthError,
  TEEIntegrityResult,
  TokenGenerationResult,
  TokenRefreshCallback,
} from "../types/per.types";

/**
 * TEE attestation result
 */
export interface TEEAttestation {
  verified: boolean;
  enclaveId: string;
  timestamp: number;
  signature: string;
}

/**
 * Vault balance query result from PER
 */
export interface VaultBalanceResponse {
  vaultId: string;
  totalBalance: string; // bigint as string
  memberBalances: Array<{
    owner: string;
    balance: string;
  }>;
  lastUpdated: number;
}

/**
 * PER operation result
 */
export interface PEROperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  attestation?: TEEAttestation;
}

/**
 * PER Client Error
 */
export class PERClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PERClientError";
  }
}

/**
 * Token Manager Implementation
 */
class TokenManagerImpl implements TokenManager {
  public token: string | null = null;
  public expiresAt: number | null = null;

  isExpired(bufferSeconds: number = 60): boolean {
    if (!this.token || !this.expiresAt) {
      return true;
    }
    const now = Date.now();
    const bufferMs = bufferSeconds * 1000;
    return now >= this.expiresAt - bufferMs;
  }

  clear(): void {
    this.token = null;
    this.expiresAt = null;
  }

  setToken(token: string, ttlSeconds: number = 3600): void {
    this.token = token;
    this.expiresAt = Date.now() + ttlSeconds * 1000;
  }
}

/**
 * PER Client for TEE interactions with wallet-based authentication
 */
export class PERClient {
  private client: AxiosInstance;
  private config: PERConfig;
  private wallet: WalletSigner | null = null;
  private tokenManager: TokenManagerImpl;
  private refreshCallbacks: TokenRefreshCallback[] = [];
  private isRefreshing: boolean = false;

  constructor(config: PERConfig) {
    this.config = config;
    this.tokenManager = new TokenManagerImpl();

    // Create axios instance without Authorization header (will be added per-request)
    this.client = axios.create({
      timeout: config.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Handle 401 errors by attempting token refresh
        if (error.response?.status === 401 && this.wallet && this.config.tokenConfig?.autoRefresh) {
          if (!this.isRefreshing) {
            try {
              await this.refreshToken();
              // Retry the original request
              if (error.config) {
                return this.client.request(error.config);
              }
            } catch (refreshError) {
              throw this.handleAxiosError(error);
            }
          }
        }
        throw this.handleAxiosError(error);
      },
    );
  }

  /**
   * Authenticate with wallet and generate auth token
   * CRITICAL: Must be called before any vault operations
   *
   * @param wallet - Wallet signer for generating signatures
   * @param options - Authentication options
   */
  async authenticate(
    wallet: WalletSigner,
    options?: Partial<PERAuthOptions>,
  ): Promise<TokenGenerationResult> {
    this.wallet = wallet;

    const authOptions: PERAuthOptions = {
      wallet,
      verifyIntegrity: options?.verifyIntegrity ?? this.config.verifyIntegrity,
      tokenTTL: options?.tokenTTL ?? this.config.tokenConfig?.ttl ?? 3600,
      autoRefresh: options?.autoRefresh ?? this.config.tokenConfig?.autoRefresh ?? true,
    };

    try {
      let integrityResult: TEEIntegrityResult | undefined;

      // Step 1: Verify TEE RPC integrity (if enabled)
      if (authOptions.verifyIntegrity) {
        integrityResult = await this.verifyTeeIntegrity();
        if (!integrityResult.verified) {
          throw new PERClientError(
            "TEE integrity verification failed - potential security risk",
            "INTEGRITY_VERIFICATION_FAILED",
            integrityResult,
          );
        }
      }

      // Step 2: Generate auth token by having wallet sign
      const tokenTTL = authOptions.tokenTTL ?? 3600;
      const token = await this.generateAuthToken(wallet, tokenTTL);

      // Step 3: Store token in manager
      this.tokenManager.setToken(token, tokenTTL);

      const expiresAt = Date.now() + tokenTTL * 1000;

      // Notify callbacks
      this.notifyTokenRefresh(token, expiresAt);

      return {
        token,
        expiresAt,
        integrity: integrityResult,
      };
    } catch (error) {
      if (error instanceof PERClientError) throw error;
      throw new PERClientError(
        "Authentication failed",
        "AUTH_FAILED",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Verify TEE RPC integrity using Magic Block SDK
   */
  async verifyTeeIntegrity(): Promise<TEEIntegrityResult> {
    try {
      const verified = await verifyTeeRpcIntegrity(this.config.endpoint);

      return {
        verified,
        timestamp: Date.now(),
        measurement: verified ? "valid" : undefined,
        error: verified ? undefined : "TEE integrity check failed",
      };
    } catch (error) {
      return {
        verified: false,
        timestamp: Date.now(),
        error:
          error instanceof Error ? error.message : "Unknown error during integrity verification",
      };
    }
  }

  /**
   * Generate authentication token using wallet signature
   * Uses getAuthToken from @magicblock-labs/ephemeral-rollups-sdk
   */
  private async generateAuthToken(wallet: WalletSigner, ttl: number): Promise<string> {
    try {
      // Create signing callback that uses the wallet's signMessage method
      const signCallback = async (message: Uint8Array): Promise<Uint8Array> => {
        return await wallet.signMessage(message);
      };

      // Use Magic Block SDK to get auth token
      const tokenResult = await getAuthToken(this.config.endpoint, wallet.publicKey, signCallback);

      if (!tokenResult) {
        throw new Error("Failed to generate auth token - empty response");
      }

      // getAuthToken returns { token: string, expiresAt: number } or just string
      const token = typeof tokenResult === "string" ? tokenResult : tokenResult.token;

      if (!token) {
        throw new Error("Failed to generate auth token - no token in response");
      }

      return token;
    } catch (error) {
      throw new PERClientError(
        "Token generation failed",
        "TOKEN_GENERATION_FAILED",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Refresh the authentication token
   */
  async refreshToken(): Promise<string> {
    if (!this.wallet) {
      throw new PERClientError("Cannot refresh token - no wallet connected", "NO_WALLET");
    }

    this.isRefreshing = true;

    try {
      const ttl = this.config.tokenConfig?.ttl ?? 3600;
      const token = await this.generateAuthToken(this.wallet, ttl);
      this.tokenManager.setToken(token, ttl);

      const expiresAt = Date.now() + ttl * 1000;
      this.notifyTokenRefresh(token, expiresAt);

      return token;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Register a callback to be notified when token is refreshed
   */
  onTokenRefresh(callback: TokenRefreshCallback): void {
    this.refreshCallbacks.push(callback);
  }

  /**
   * Notify all registered callbacks of token refresh
   */
  private notifyTokenRefresh(token: string, expiresAt: number): void {
    for (const callback of this.refreshCallbacks) {
      try {
        callback(token, expiresAt);
      } catch (error) {
        console.error("Token refresh callback error:", error);
      }
    }
  }

  /**
   * Get authenticated endpoint URL with token
   */
  private getAuthenticatedEndpoint(): string {
    if (!this.tokenManager.token) {
      throw new PERClientError(
        "Not authenticated - call authenticate() first",
        "NOT_AUTHENTICATED",
      );
    }

    // Check if token needs refresh
    if (this.tokenManager.isExpired(this.config.tokenConfig?.refreshBuffer ?? 60)) {
      if (this.config.tokenConfig?.autoRefresh && this.wallet && !this.isRefreshing) {
        // Trigger async refresh (don't block current request)
        this.refreshToken().catch((error) => {
          console.error("Background token refresh failed:", error);
        });
      }
    }

    return `${this.config.endpoint}?token=${encodeURIComponent(this.tokenManager.token)}`;
  }

  /**
   * Verify TEE attestation
   * CRITICAL: Always call this before sensitive operations in production
   */
  async verifyAttestation(): Promise<TEEAttestation> {
    if (!this.config.verifyIntegrity) {
      // Return mock attestation for development/testing
      return {
        verified: false,
        enclaveId: "dev-enclave",
        timestamp: Date.now(),
        signature: "0x0",
      };
    }

    try {
      const endpoint = this.getAuthenticatedEndpoint();
      const response = await this.client.get<TEEAttestation>(`${endpoint}&path=/attestation`);

      if (!response.data.verified) {
        throw new PERClientError(
          "TEE attestation verification failed",
          "ATTESTATION_FAILED",
          response.data,
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof PERClientError) throw error;
      throw new PERClientError("Failed to verify TEE attestation", "ATTESTATION_ERROR", error);
    }
  }

  /**
   * Query vault balance through PER
   * This operation is privacy-preserving and only accessible to vault members
   */
  async getVaultBalance(
    vaultId: Buffer,
    ownerPublicKey: string,
  ): Promise<PEROperationResult<VaultBalanceResponse>> {
    try {
      // Verify attestation in production
      const attestation = await this.verifyAttestation();

      const endpoint = this.getAuthenticatedEndpoint();
      const response = await this.retryOperation(async () => {
        return await this.client.post<VaultBalanceResponse>(`${endpoint}&path=/vault/balance`, {
          vaultId: vaultId.toString("hex"),
          owner: ownerPublicKey,
        });
      });

      return {
        success: true,
        data: response.data,
        attestation,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Query vault members through PER
   */
  async getVaultMembers(vaultId: Buffer): Promise<PEROperationResult<string[]>> {
    try {
      const attestation = await this.verifyAttestation();

      const endpoint = this.getAuthenticatedEndpoint();
      const response = await this.retryOperation(async () => {
        return await this.client.get<string[]>(
          `${endpoint}&path=/vault/${vaultId.toString("hex")}/members`,
        );
      });

      return {
        success: true,
        data: response.data,
        attestation,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check PER health status
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Health check doesn't require authentication
      const response = await this.client.get(`${this.config.endpoint}/health`);
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Disconnect wallet and clear token
   */
  disconnect(): void {
    this.wallet = null;
    this.tokenManager.clear();
    this.refreshCallbacks = [];
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.wallet !== null && !this.tokenManager.isExpired();
  }

  /**
   * Get current token expiration info
   */
  getTokenInfo(): { token: string | null; expiresAt: number | null; isExpired: boolean } {
    return {
      token: this.tokenManager.token,
      expiresAt: this.tokenManager.expiresAt,
      isExpired: this.tokenManager.isExpired(),
    };
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        // Don't retry on client errors (4xx) except 401 (handled by interceptor)
        if (error instanceof PERClientError && error.code.startsWith("4") && error.code !== "401") {
          throw error;
        }

        // Wait before retrying
        if (attempt < this.config.retryConfig.maxRetries) {
          const delay = this.config.retryConfig.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new PERClientError(
      `Operation failed after ${this.config.retryConfig.maxRetries} retries`,
      "MAX_RETRIES_EXCEEDED",
      lastError,
    );
  }

  /**
   * Handle Axios errors and convert to PERClientError
   */
  private handleAxiosError(error: AxiosError): PERClientError {
    if (error.response) {
      // Server responded with error status
      return new PERClientError(
        (error.response.data as string) || error.message,
        `HTTP_${error.response.status}`,
        error.response.data,
      );
    } else if (error.request) {
      // Request made but no response
      return new PERClientError("No response from PER endpoint", "NO_RESPONSE", error.request);
    } else {
      // Request setup error
      return new PERClientError(error.message, "REQUEST_SETUP_ERROR", error);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PERConfig> {
    return { ...this.config };
  }
}

/**
 * Create a PER client with configuration
 * Note: You must call authenticate() with a wallet before making any vault requests
 */
export function createPERClient(config: PERConfig): PERClient {
  return new PERClient(config);
}

// Re-export types
export type {
  WalletSigner,
  TokenManager,
  PERAuthOptions,
  TEEIntegrityResult,
  TokenGenerationResult,
  TokenRefreshCallback,
} from "../types/per.types";
export { PERAuthError } from "../types/per.types";
