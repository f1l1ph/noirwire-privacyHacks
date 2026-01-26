/**
 * NoirWire SDK - PER React Integration Examples
 *
 * Demonstrates how to integrate the PER client with React and Solana wallet adapters
 */

import React, { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { createPERConfig, createPERClient, PERClientError, PERAuthError } from "@noirwire/sdk";
import type { PERClient, TokenGenerationResult } from "@noirwire/sdk";

// ============================================
// Example 1: Basic PER Hook
// ============================================

/**
 * Custom hook for managing PER client with wallet
 */
export function usePERClient() {
  const wallet = useWallet();
  const [client, setClient] = useState<PERClient | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);

  useEffect(() => {
    async function initPER() {
      if (!wallet.publicKey || !wallet.signMessage) {
        setClient(null);
        return;
      }

      setIsAuthenticating(true);
      setAuthError(null);

      try {
        const config = createPERConfig("devnet", {
          verifyIntegrity: true,
          tokenConfig: {
            ttl: 3600,
            autoRefresh: true,
            refreshBuffer: 60,
          },
        });

        const perClient = createPERClient(config);

        // Set up token refresh listener
        perClient.onTokenRefresh((newToken, expiresAt) => {
          console.log("Token refreshed automatically");
          setTokenExpiry(expiresAt);
        });

        // Authenticate
        const authResult = await perClient.authenticate({
          publicKey: wallet.publicKey,
          signMessage: wallet.signMessage,
        });

        setClient(perClient);
        setTokenExpiry(authResult.expiresAt);
      } catch (error) {
        if (error instanceof PERAuthError) {
          switch (error.code) {
            case "USER_REJECTED":
              setAuthError("Authentication canceled - please approve the signature request");
              break;
            case "INTEGRITY_VERIFICATION_FAILED":
              setAuthError("Security check failed - cannot connect to PER");
              break;
            default:
              setAuthError(error.message);
          }
        } else {
          setAuthError("Failed to authenticate with PER");
        }
      } finally {
        setIsAuthenticating(false);
      }
    }

    initPER();

    // Cleanup on unmount
    return () => {
      client?.disconnect();
    };
  }, [wallet.publicKey, wallet.signMessage]);

  return {
    client,
    isAuthenticated: client?.isAuthenticated() ?? false,
    isAuthenticating,
    authError,
    tokenExpiry,
  };
}

// ============================================
// Example 2: Vault Balance Component
// ============================================

export function VaultBalance({ vaultId }: { vaultId: string }) {
  const wallet = useWallet();
  const { client, isAuthenticated, isAuthenticating, authError } = usePERClient();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!client || !wallet.publicKey || !isAuthenticated) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const vaultBuffer = Buffer.from(vaultId, "hex");
      const result = await client.getVaultBalance(vaultBuffer, wallet.publicKey.toString());

      if (result.success && result.data) {
        setBalance(result.data.totalBalance);
      } else {
        setError(result.error || "Failed to fetch balance");
      }
    } catch (err) {
      if (err instanceof PERClientError) {
        setError(`PER Error: ${err.message}`);
      } else {
        setError("Unknown error occurred");
      }
    } finally {
      setLoading(false);
    }
  }, [client, wallet.publicKey, isAuthenticated, vaultId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBalance();
    }
  }, [isAuthenticated, fetchBalance]);

  if (!wallet.connected) {
    return (
      <div className="vault-balance">
        <p>Please connect your wallet to view vault balance</p>
        <WalletMultiButton />
      </div>
    );
  }

  if (isAuthenticating) {
    return <div className="vault-balance">Authenticating with PER...</div>;
  }

  if (authError) {
    return (
      <div className="vault-balance error">
        <p>Authentication Error: {authError}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <div className="vault-balance">Not authenticated</div>;
  }

  return (
    <div className="vault-balance">
      <h3>Vault Balance</h3>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {balance && (
        <div>
          <p className="balance">{balance} lamports</p>
          <button onClick={fetchBalance} disabled={loading}>
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Example 3: Token Expiry Monitor
// ============================================

export function TokenExpiryMonitor() {
  const { client, tokenExpiry } = usePERClient();
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    if (!tokenExpiry) {
      setTimeRemaining("Not authenticated");
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, tokenExpiry - now);

      if (remaining === 0) {
        setTimeRemaining("Token expired (auto-refreshing...)");
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [tokenExpiry]);

  if (!client) {
    return null;
  }

  return (
    <div className="token-monitor">
      <small>Token expires in: {timeRemaining}</small>
    </div>
  );
}

// ============================================
// Example 4: PER Status Dashboard
// ============================================

export function PERStatusDashboard() {
  const wallet = useWallet();
  const { client, isAuthenticated, isAuthenticating, authError, tokenExpiry } = usePERClient();
  const [teeVerified, setTeeVerified] = useState<boolean | null>(null);
  const [healthStatus, setHealthStatus] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkStatus() {
      if (!client) return;

      // Check TEE integrity
      const integrity = await client.verifyTeeIntegrity();
      setTeeVerified(integrity.verified);

      // Check health
      const healthy = await client.healthCheck();
      setHealthStatus(healthy);
    }

    checkStatus();
  }, [client]);

  return (
    <div className="per-status-dashboard">
      <h2>PER Connection Status</h2>

      <div className="status-grid">
        <div className="status-item">
          <label>Wallet:</label>
          <span className={wallet.connected ? "status-good" : "status-bad"}>
            {wallet.connected ? "✅ Connected" : "❌ Not Connected"}
          </span>
        </div>

        <div className="status-item">
          <label>PER Authentication:</label>
          {isAuthenticating ? (
            <span className="status-pending">⏳ Authenticating...</span>
          ) : isAuthenticated ? (
            <span className="status-good">✅ Authenticated</span>
          ) : authError ? (
            <span className="status-bad">❌ {authError}</span>
          ) : (
            <span className="status-bad">❌ Not Authenticated</span>
          )}
        </div>

        <div className="status-item">
          <label>TEE Integrity:</label>
          {teeVerified === null ? (
            <span className="status-pending">⏳ Checking...</span>
          ) : teeVerified ? (
            <span className="status-good">✅ Verified</span>
          ) : (
            <span className="status-warning">⚠️ Not Verified</span>
          )}
        </div>

        <div className="status-item">
          <label>PER Health:</label>
          {healthStatus === null ? (
            <span className="status-pending">⏳ Checking...</span>
          ) : healthStatus ? (
            <span className="status-good">✅ Healthy</span>
          ) : (
            <span className="status-bad">❌ Unhealthy</span>
          )}
        </div>

        {tokenExpiry && (
          <div className="status-item">
            <label>Token Expiry:</label>
            <span>{new Date(tokenExpiry).toLocaleString()}</span>
          </div>
        )}
      </div>

      {!wallet.connected && (
        <div className="action-section">
          <WalletMultiButton />
        </div>
      )}

      {authError && (
        <div className="error-section">
          <p>Authentication failed. Please try reconnecting your wallet.</p>
          <button onClick={() => window.location.reload()}>Retry Connection</button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Example 5: Vault Operations Component
// ============================================

export function VaultOperations({ vaultId }: { vaultId: string }) {
  const wallet = useWallet();
  const { client, isAuthenticated } = usePERClient();
  const [members, setMembers] = useState<string[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVaultData = useCallback(async () => {
    if (!client || !wallet.publicKey || !isAuthenticated) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const vaultBuffer = Buffer.from(vaultId, "hex");

      // Fetch members and balance in parallel
      const [membersResult, balanceResult] = await Promise.all([
        client.getVaultMembers(vaultBuffer),
        client.getVaultBalance(vaultBuffer, wallet.publicKey.toString()),
      ]);

      if (membersResult.success && membersResult.data) {
        setMembers(membersResult.data);
      } else {
        throw new Error(membersResult.error || "Failed to fetch members");
      }

      if (balanceResult.success && balanceResult.data) {
        setBalance(balanceResult.data);
      } else {
        throw new Error(balanceResult.error || "Failed to fetch balance");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load vault data");
    } finally {
      setLoading(false);
    }
  }, [client, wallet.publicKey, isAuthenticated, vaultId]);

  useEffect(() => {
    if (isAuthenticated) {
      loadVaultData();
    }
  }, [isAuthenticated, loadVaultData]);

  if (!isAuthenticated) {
    return <div>Please authenticate to view vault operations</div>;
  }

  return (
    <div className="vault-operations">
      <h3>Vault Operations</h3>

      <button onClick={loadVaultData} disabled={loading}>
        {loading ? "Loading..." : "Refresh Data"}
      </button>

      {error && <div className="error">{error}</div>}

      {balance && (
        <div className="balance-section">
          <h4>Balance Information</h4>
          <p>Total Balance: {balance.totalBalance} lamports</p>
          <p>Members: {balance.memberBalances.length}</p>
          <p>Last Updated: {new Date(balance.lastUpdated).toLocaleString()}</p>
        </div>
      )}

      {members.length > 0 && (
        <div className="members-section">
          <h4>Vault Members</h4>
          <ul>
            {members.map((member, index) => (
              <li key={index}>
                {member.substring(0, 8)}...{member.substring(member.length - 8)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================
// Example 6: Complete App Example
// ============================================

export function PERApp() {
  const [selectedVaultId] = useState("0".repeat(64)); // Mock vault ID

  return (
    <div className="per-app">
      <header>
        <h1>NoirWire PER Integration</h1>
        <TokenExpiryMonitor />
      </header>

      <main>
        <PERStatusDashboard />
        <VaultBalance vaultId={selectedVaultId} />
        <VaultOperations vaultId={selectedVaultId} />
      </main>
    </div>
  );
}

// ============================================
// Example 7: Error Boundary for PER Operations
// ============================================

interface PERErrorBoundaryProps {
  children: React.ReactNode;
}

interface PERErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PERErrorBoundary extends React.Component<
  PERErrorBoundaryProps,
  PERErrorBoundaryState
> {
  constructor(props: PERErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("PER Error Boundary caught error:", error, errorInfo);

    // Log to monitoring service
    if (error instanceof PERClientError) {
      console.error("PER Client Error:", error.code, error.details);
    } else if (error instanceof PERAuthError) {
      console.error("PER Auth Error:", error.code, error.details);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong with PER connection</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>Try Again</button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================
// Styles (CSS-in-JS example)
// ============================================

export const styles = `
  .per-app {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  .per-status-dashboard {
    background: #f5f5f5;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 15px;
    margin-top: 15px;
  }

  .status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    background: white;
    border-radius: 4px;
  }

  .status-good { color: #10b981; }
  .status-bad { color: #ef4444; }
  .status-warning { color: #f59e0b; }
  .status-pending { color: #6b7280; }

  .vault-balance, .vault-operations {
    background: white;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .error {
    color: #ef4444;
    padding: 10px;
    background: #fee2e2;
    border-radius: 4px;
    margin: 10px 0;
  }

  .token-monitor {
    position: fixed;
    top: 10px;
    right: 10px;
    background: white;
    padding: 10px 15px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }

  button {
    padding: 10px 20px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button:hover:not(:disabled) {
    background: #2563eb;
  }
`;
