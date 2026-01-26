/**
 * NoirWire SDK - PER Wallet Authentication Examples
 *
 * This file demonstrates how to use the PER client with wallet-based authentication
 * in various scenarios and frameworks.
 */

import { createPERConfig, createPERClient, PERClientError, PERAuthError } from "@noirwire/sdk";
import type { WalletSigner } from "@noirwire/sdk";
import { PublicKey } from "@solana/web3.js";

// ============================================
// Example 1: Basic Authentication with Wallet
// ============================================

async function basicAuthentication(wallet: WalletSigner) {
  console.log("Example 1: Basic Authentication\n");

  // Create PER configuration
  const config = createPERConfig("devnet", {
    endpoint: "https://tee.magicblock.app",
    verifyIntegrity: true, // Verify TEE before auth
    tokenConfig: {
      ttl: 3600, // 1 hour
      autoRefresh: true, // Auto-refresh when expired
      refreshBuffer: 60, // Refresh 1 min before expiry
    },
  });

  // Create PER client
  const perClient = createPERClient(config);

  try {
    // Authenticate with wallet (triggers signature request)
    console.log("Requesting wallet signature...");
    const authResult = await perClient.authenticate(wallet);

    console.log("✅ Authentication successful!");
    console.log("Token:", authResult.token.substring(0, 30) + "...");
    console.log("Expires:", new Date(authResult.expiresAt).toISOString());

    if (authResult.integrity) {
      console.log("TEE Integrity:", authResult.integrity.verified ? "✅ Verified" : "❌ Failed");
    }

    // Check authentication status
    console.log("\nAuthenticated:", perClient.isAuthenticated());

    return perClient;
  } catch (error) {
    if (error instanceof PERAuthError) {
      switch (error.code) {
        case "USER_REJECTED":
          console.error("❌ User declined to sign authentication message");
          break;
        case "INTEGRITY_VERIFICATION_FAILED":
          console.error("❌ TEE integrity check failed - potential security risk!");
          break;
        case "TOKEN_GENERATION_FAILED":
          console.error("❌ Failed to generate auth token:", error.details);
          break;
        default:
          console.error("❌ Authentication error:", error.message);
      }
    }
    throw error;
  }
}

// ============================================
// Example 2: Vault Balance Query with Auto-Refresh
// ============================================

async function queryVaultBalance(perClient: any, vaultId: Buffer, owner: string) {
  console.log("\n\nExample 2: Vault Balance Query\n");

  try {
    // The SDK automatically handles token refresh if needed
    const result = await perClient.getVaultBalance(vaultId, owner);

    if (result.success && result.data) {
      console.log("✅ Vault balance retrieved successfully");
      console.log("Vault ID:", result.data.vaultId);
      console.log("Total Balance:", result.data.totalBalance);
      console.log("Member Count:", result.data.memberBalances.length);
      console.log("Last Updated:", new Date(result.data.lastUpdated).toISOString());

      // Show individual member balances
      console.log("\nMember Balances:");
      for (const member of result.data.memberBalances) {
        console.log(`  ${member.owner}: ${member.balance}`);
      }
    } else {
      console.error("❌ Failed to retrieve balance:", result.error);
    }

    return result;
  } catch (error) {
    if (error instanceof PERClientError) {
      switch (error.code) {
        case "NOT_AUTHENTICATED":
          console.error("❌ Not authenticated - please authenticate first");
          break;
        case "NO_RESPONSE":
          console.error("❌ Cannot connect to PER endpoint");
          break;
        case "HTTP_401":
          console.error("❌ Token expired - attempting refresh...");
          // SDK will automatically retry with refreshed token
          break;
        default:
          console.error("❌ Error:", error.message);
      }
    }
    throw error;
  }
}

// ============================================
// Example 3: Token Refresh Monitoring
// ============================================

async function monitorTokenRefresh(perClient: any) {
  console.log("\n\nExample 3: Token Refresh Monitoring\n");

  // Register callback for token refresh events
  perClient.onTokenRefresh((newToken: string, expiresAt: number) => {
    const expiryDate = new Date(expiresAt);
    console.log("🔄 Token refreshed automatically");
    console.log("New Token:", newToken.substring(0, 30) + "...");
    console.log("New Expiry:", expiryDate.toISOString());

    // Calculate time until expiry
    const timeUntilExpiry = Math.floor((expiresAt - Date.now()) / 1000);
    console.log(
      `Valid for: ${timeUntilExpiry} seconds (${Math.floor(timeUntilExpiry / 60)} minutes)`,
    );
  });

  // Get current token info
  const tokenInfo = perClient.getTokenInfo();
  console.log("Current Token Info:");
  console.log("Token:", tokenInfo.token ? tokenInfo.token.substring(0, 30) + "..." : "None");
  console.log(
    "Expires At:",
    tokenInfo.expiresAt ? new Date(tokenInfo.expiresAt).toISOString() : "N/A",
  );
  console.log("Is Expired:", tokenInfo.isExpired);

  if (tokenInfo.expiresAt) {
    const timeUntilExpiry = Math.floor((tokenInfo.expiresAt - Date.now()) / 1000);
    console.log(`Time until expiry: ${timeUntilExpiry} seconds`);
  }
}

// ============================================
// Example 4: Manual Token Refresh
// ============================================

async function manualTokenRefresh(perClient: any) {
  console.log("\n\nExample 4: Manual Token Refresh\n");

  try {
    console.log("Manually refreshing token...");
    const newToken = await perClient.refreshToken();

    console.log("✅ Token refreshed successfully");
    console.log("New Token:", newToken.substring(0, 30) + "...");

    const tokenInfo = perClient.getTokenInfo();
    console.log("New Expiry:", new Date(tokenInfo.expiresAt).toISOString());
  } catch (error) {
    if (error instanceof PERClientError && error.code === "NO_WALLET") {
      console.error("❌ Cannot refresh - wallet disconnected");
    } else {
      console.error("❌ Token refresh failed:", error);
    }
  }
}

// ============================================
// Example 5: Error Recovery Pattern
// ============================================

async function robustVaultQuery(
  perClient: any,
  wallet: WalletSigner,
  vaultId: Buffer,
  owner: string,
) {
  console.log("\n\nExample 5: Robust Query with Error Recovery\n");

  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      // Check authentication
      if (!perClient.isAuthenticated()) {
        console.log("Not authenticated, authenticating now...");
        await perClient.authenticate(wallet);
      }

      // Make request
      const result = await perClient.getVaultBalance(vaultId, owner);

      if (result.success) {
        console.log("✅ Query successful:", result.data?.totalBalance);
        return result.data;
      }

      throw new Error(result.error || "Unknown error");
    } catch (error: any) {
      retries++;
      console.log(`Attempt ${retries}/${maxRetries} failed`);

      if (error.code === "NOT_AUTHENTICATED" || error.code === "HTTP_401") {
        // Clear and re-authenticate
        console.log("Re-authenticating...");
        perClient.disconnect();
        continue;
      }

      if (error.code === "USER_REJECTED") {
        // User declined signature - don't retry
        console.error("❌ User declined authentication");
        throw error;
      }

      if (error.code === "INTEGRITY_VERIFICATION_FAILED") {
        // Critical security issue - don't retry
        console.error("❌ TEE integrity verification failed - aborting");
        throw error;
      }

      if (retries >= maxRetries) {
        console.error("❌ Max retries exceeded");
        throw error;
      }

      // Wait before retry with exponential backoff
      const delay = 1000 * retries;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Max retries exceeded");
}

// ============================================
// Example 6: Disconnect and Cleanup
// ============================================

async function disconnectWallet(perClient: any) {
  console.log("\n\nExample 6: Disconnect and Cleanup\n");

  console.log("Before disconnect:");
  console.log("Authenticated:", perClient.isAuthenticated());

  const tokenInfo = perClient.getTokenInfo();
  console.log("Token:", tokenInfo.token ? "Present" : "None");

  // Disconnect (clears wallet and token)
  perClient.disconnect();

  console.log("\nAfter disconnect:");
  console.log("Authenticated:", perClient.isAuthenticated());

  const tokenInfoAfter = perClient.getTokenInfo();
  console.log("Token:", tokenInfoAfter.token ? "Present" : "None");

  console.log("✅ Disconnected and cleaned up");
}

// ============================================
// Example 7: TEE Integrity Verification Only
// ============================================

async function verifyTeeIntegrity(perClient: any) {
  console.log("\n\nExample 7: TEE Integrity Verification\n");

  try {
    console.log("Verifying TEE RPC integrity...");
    const integrity = await perClient.verifyTeeIntegrity();

    console.log("Verification Result:");
    console.log("Verified:", integrity.verified ? "✅ Yes" : "❌ No");
    console.log("Timestamp:", new Date(integrity.timestamp).toISOString());

    if (integrity.measurement) {
      console.log("Measurement:", integrity.measurement);
    }

    if (integrity.error) {
      console.error("Error:", integrity.error);
    }

    return integrity.verified;
  } catch (error) {
    console.error("❌ Integrity verification error:", error);
    return false;
  }
}

// ============================================
// Example 8: Complete Workflow
// ============================================

async function completeWorkflow() {
  console.log("Example 8: Complete PER Client Workflow\n");
  console.log("=".repeat(50));

  // Mock wallet for demonstration
  // In real usage, this comes from @solana/wallet-adapter-react
  const mockWallet: WalletSigner = {
    publicKey: new PublicKey("11111111111111111111111111111111"),
    signMessage: async (message: Uint8Array) => {
      // Real wallet would sign here
      console.log("Wallet signing message...");
      return new Uint8Array(64); // Mock signature
    },
  };

  const mockVaultId = Buffer.from("a".repeat(64), "hex");
  const mockOwner = mockWallet.publicKey.toString();

  try {
    // Step 1: Authenticate
    const perClient = await basicAuthentication(mockWallet);

    // Step 2: Set up token monitoring
    await monitorTokenRefresh(perClient);

    // Step 3: Verify TEE integrity
    const isSecure = await verifyTeeIntegrity(perClient);
    if (!isSecure) {
      console.warn("⚠️  TEE integrity check failed - proceed with caution");
    }

    // Step 4: Query vault balance
    await queryVaultBalance(perClient, mockVaultId, mockOwner);

    // Step 5: Demonstrate robust query with error recovery
    await robustVaultQuery(perClient, mockWallet, mockVaultId, mockOwner);

    // Step 6: Manually refresh token
    await manualTokenRefresh(perClient);

    // Step 7: Disconnect
    await disconnectWallet(perClient);

    console.log("\n" + "=".repeat(50));
    console.log("✅ Complete workflow finished successfully!");
  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("❌ Workflow failed:", error);
  }
}

// ============================================
// Run Examples
// ============================================

if (require.main === module) {
  completeWorkflow().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

// Export examples for use in other modules
export {
  basicAuthentication,
  queryVaultBalance,
  monitorTokenRefresh,
  manualTokenRefresh,
  robustVaultQuery,
  disconnectWallet,
  verifyTeeIntegrity,
  completeWorkflow,
};
