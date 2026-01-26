/**
 * NoirWire SDK - PER (Private Execution Runtime) Configuration
 *
 * This module manages configuration for MagicBlock's TEE (Trusted Execution Environment)
 * integration. The PER system enables privacy-preserving vault operations through
 * secure enclaves.
 *
 * SECURITY NOTES:
 * - PER endpoints MUST use HTTPS in production
 * - Never send private keys or nullifier secrets to PER
 * - Always verify TEE attestation before sensitive operations
 * - Use timeout guards to prevent hanging requests
 * - Authentication uses wallet-based signatures (no static API keys)
 */

export interface PERConfig {
  /**
   * MagicBlock PER TEE endpoint URL
   * Production: https://tee.magicblock.app
   * Development: Configure based on MagicBlock documentation
   * NOTE: Do NOT include query parameters here - token will be appended by client
   */
  endpoint: string;

  /**
   * Request timeout in milliseconds
   * Recommended: 30000 (30 seconds)
   * Adjust based on network conditions and operation complexity
   */
  timeout: number;

  /**
   * Enable TEE integrity verification before authentication
   * Always true in production for security
   * Uses verifyTeeRpcIntegrity from @magicblock-labs/ephemeral-rollups-sdk
   */
  verifyIntegrity: boolean;

  /**
   * Retry configuration for transient failures
   */
  retryConfig: {
    maxRetries: number;
    retryDelay: number; // milliseconds
  };

  /**
   * Token configuration for wallet-based authentication
   */
  tokenConfig?: {
    /**
     * Token time-to-live in seconds
     * @default 3600 (1 hour)
     */
    ttl: number;

    /**
     * Automatically refresh token when it expires
     * @default true
     */
    autoRefresh: boolean;

    /**
     * Buffer time before expiry to trigger refresh (seconds)
     * @default 60 (1 minute)
     */
    refreshBuffer: number;
  };
}

/**
 * Default PER configuration for different environments
 */
export const DEFAULT_PER_CONFIG: Record<"mainnet" | "devnet" | "localnet", Partial<PERConfig>> = {
  mainnet: {
    endpoint: "https://tee.magicblock.app",
    timeout: 30000,
    verifyIntegrity: true,
    retryConfig: {
      maxRetries: 3,
      retryDelay: 1000,
    },
    tokenConfig: {
      ttl: 3600, // 1 hour
      autoRefresh: true,
      refreshBuffer: 60, // 1 minute
    },
  },
  devnet: {
    endpoint: process.env.MAGICBLOCK_TEE_ENDPOINT || "https://tee.magicblock.app",
    timeout: 30000,
    verifyIntegrity: true,
    retryConfig: {
      maxRetries: 3,
      retryDelay: 1000,
    },
    tokenConfig: {
      ttl: 3600,
      autoRefresh: true,
      refreshBuffer: 60,
    },
  },
  localnet: {
    endpoint: process.env.MAGICBLOCK_TEE_ENDPOINT || "http://localhost:9000",
    timeout: 10000,
    verifyIntegrity: false, // Disable for local testing
    retryConfig: {
      maxRetries: 1,
      retryDelay: 500,
    },
    tokenConfig: {
      ttl: 7200, // 2 hours (longer for dev)
      autoRefresh: true,
      refreshBuffer: 300, // 5 minutes
    },
  },
};

/**
 * Validate PER configuration
 * Throws error if configuration is invalid
 */
export function validatePERConfig(config: Partial<PERConfig>): void {
  if (!config.endpoint) {
    throw new Error("PER endpoint is required");
  }

  // Ensure HTTPS in production
  if (config.verifyIntegrity && !config.endpoint.startsWith("https://")) {
    throw new Error("PER endpoint must use HTTPS when integrity verification is enabled");
  }

  // Validate URL format
  try {
    new URL(config.endpoint);
  } catch {
    throw new Error(`Invalid PER endpoint URL: ${config.endpoint}`);
  }

  // Validate timeout
  if (config.timeout && (config.timeout < 1000 || config.timeout > 120000)) {
    throw new Error("PER timeout must be between 1000ms and 120000ms");
  }

  // Validate retry config
  if (config.retryConfig) {
    if (config.retryConfig.maxRetries < 0 || config.retryConfig.maxRetries > 10) {
      throw new Error("PER maxRetries must be between 0 and 10");
    }
    if (config.retryConfig.retryDelay < 0 || config.retryConfig.retryDelay > 10000) {
      throw new Error("PER retryDelay must be between 0 and 10000ms");
    }
  }

  // Validate token config
  if (config.tokenConfig) {
    if (config.tokenConfig.ttl < 300 || config.tokenConfig.ttl > 86400) {
      throw new Error("Token TTL must be between 300s (5 minutes) and 86400s (24 hours)");
    }
    if (
      config.tokenConfig.refreshBuffer < 0 ||
      config.tokenConfig.refreshBuffer > config.tokenConfig.ttl / 2
    ) {
      throw new Error("Token refresh buffer must be less than half the TTL");
    }
  }
}

/**
 * Create PER configuration for a given network
 * Merges default config with user overrides
 */
export function createPERConfig(
  network: "mainnet" | "devnet" | "localnet",
  overrides?: Partial<PERConfig>,
): PERConfig {
  const defaultConfig = DEFAULT_PER_CONFIG[network];
  const config: PERConfig = {
    endpoint: overrides?.endpoint || defaultConfig.endpoint || "",
    timeout: overrides?.timeout || defaultConfig.timeout || 30000,
    verifyIntegrity: overrides?.verifyIntegrity ?? defaultConfig.verifyIntegrity ?? true,
    retryConfig: {
      maxRetries: overrides?.retryConfig?.maxRetries || defaultConfig.retryConfig?.maxRetries || 3,
      retryDelay:
        overrides?.retryConfig?.retryDelay || defaultConfig.retryConfig?.retryDelay || 1000,
    },
    tokenConfig: {
      ttl: overrides?.tokenConfig?.ttl || defaultConfig.tokenConfig?.ttl || 3600,
      autoRefresh:
        overrides?.tokenConfig?.autoRefresh ?? defaultConfig.tokenConfig?.autoRefresh ?? true,
      refreshBuffer:
        overrides?.tokenConfig?.refreshBuffer || defaultConfig.tokenConfig?.refreshBuffer || 60,
    },
  };

  validatePERConfig(config);
  return config;
}

/**
 * Load PER configuration from environment variables
 * Useful for server-side applications
 * NOTE: Wallet-based authentication is configured at runtime, not via env vars
 */
export function loadPERConfigFromEnv(network: "mainnet" | "devnet" | "localnet"): PERConfig {
  const overrides: Partial<PERConfig> = {};

  if (process.env.MAGICBLOCK_TEE_ENDPOINT) {
    overrides.endpoint = process.env.MAGICBLOCK_TEE_ENDPOINT;
  }

  if (process.env.PER_TIMEOUT) {
    overrides.timeout = parseInt(process.env.PER_TIMEOUT, 10);
  }

  if (process.env.PER_VERIFY_INTEGRITY) {
    overrides.verifyIntegrity = process.env.PER_VERIFY_INTEGRITY === "true";
  }

  if (process.env.PER_TOKEN_TTL) {
    overrides.tokenConfig = {
      ...overrides.tokenConfig,
      ttl: parseInt(process.env.PER_TOKEN_TTL, 10),
      autoRefresh: true,
      refreshBuffer: 60,
    };
  }

  return createPERConfig(network, overrides);
}
