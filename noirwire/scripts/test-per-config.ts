#!/usr/bin/env tsx
/**
 * Test PER Configuration
 *
 * This script tests the MagicBlock PER endpoint configuration
 * and verifies connectivity and attestation.
 *
 * Usage:
 *   yarn tsx scripts/test-per-config.ts [network]
 *
 * Examples:
 *   yarn tsx scripts/test-per-config.ts devnet
 *   yarn tsx scripts/test-per-config.ts localnet
 */

import {
  loadPERConfigFromEnv,
  createPERClient,
  validatePERConfig,
} from "../packages/sdk/src/config";

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof COLORS = "reset") {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

async function testPERConfiguration() {
  const network = (process.argv[2] || "devnet") as "mainnet" | "devnet" | "localnet";

  log("\n==============================================", "cyan");
  log(`  Testing PER Configuration (${network.toUpperCase()})`, "cyan");
  log("==============================================\n", "cyan");

  // Step 1: Load configuration
  log("Step 1: Loading configuration from environment...", "blue");
  let config;
  try {
    config = loadPERConfigFromEnv(network);
    log("✅ Configuration loaded successfully", "green");
  } catch (error) {
    log(
      `❌ Failed to load configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
      "red",
    );
    process.exit(1);
  }

  // Step 2: Display configuration
  log("\nConfiguration Details:", "blue");
  console.log(`  Endpoint: ${config.endpoint}`);
  console.log(`  API Key: ${config.apiKey ? "***" + config.apiKey.slice(-4) : "(not set)"}`);
  console.log(`  Timeout: ${config.timeout}ms`);
  console.log(`  Verify Attestation: ${config.verifyAttestation}`);
  console.log(`  Max Retries: ${config.retryConfig.maxRetries}`);
  console.log(`  Retry Delay: ${config.retryConfig.retryDelay}ms`);

  // Step 3: Validate configuration
  log("\nStep 2: Validating configuration...", "blue");
  try {
    validatePERConfig(config);
    log("✅ Configuration is valid", "green");
  } catch (error) {
    log(
      `❌ Configuration validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "red",
    );
    process.exit(1);
  }

  // Step 4: Create PER client
  log("\nStep 3: Creating PER client...", "blue");
  let client;
  try {
    client = createPERClient(config);
    log("✅ PER client created successfully", "green");
  } catch (error) {
    log(
      `❌ Failed to create PER client: ${error instanceof Error ? error.message : "Unknown error"}`,
      "red",
    );
    process.exit(1);
  }

  // Step 5: Health check
  log("\nStep 4: Testing endpoint connectivity...", "blue");
  console.log("  Connecting to:", config.endpoint);

  try {
    const isHealthy = await client.healthCheck();
    if (isHealthy) {
      log("✅ Endpoint is reachable and healthy", "green");
    } else {
      log("⚠️  Endpoint responded but health check failed", "yellow");
      log("   This may be normal for mock endpoints or during maintenance", "yellow");
    }
  } catch (error) {
    log(
      `❌ Health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "red",
    );
    log("\nTroubleshooting tips:", "yellow");
    log("  1. Check if endpoint URL is correct", "yellow");
    log("  2. Verify network connectivity", "yellow");
    log("  3. Check firewall/proxy settings", "yellow");
    log("  4. For localnet, ensure PER node is running", "yellow");
  }

  // Step 6: Attestation verification (if enabled)
  if (config.verifyAttestation) {
    log("\nStep 5: Testing TEE attestation verification...", "blue");
    try {
      const attestation = await client.verifyAttestation();

      if (attestation.verified) {
        log("✅ TEE attestation verified successfully", "green");
        console.log(`  Enclave ID: ${attestation.enclaveId}`);
        console.log(`  Timestamp: ${new Date(attestation.timestamp).toISOString()}`);
        console.log(`  Signature: ${attestation.signature.slice(0, 20)}...`);
      } else {
        log("❌ TEE attestation verification failed", "red");
        log("   WARNING: Do not use this endpoint for production!", "red");
      }
    } catch (error) {
      log(
        `⚠️  Attestation verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "yellow",
      );
      log("   This is expected if the endpoint does not support attestation", "yellow");
    }
  } else {
    log("\nStep 5: TEE attestation verification is disabled", "yellow");
    log("   (This is normal for localnet/development)", "yellow");
  }

  // Summary
  log("\n==============================================", "cyan");
  log("  Configuration Test Summary", "cyan");
  log("==============================================\n", "cyan");

  log("Configuration Status:", "blue");
  log("  ✅ Configuration loaded and validated", "green");
  log("  ✅ PER client created successfully", "green");

  log("\nNext Steps:", "blue");
  log("  1. Update .env with your MagicBlock API key", "cyan");
  log("  2. Test vault operations with SDK", "cyan");
  log("  3. Integrate into your application", "cyan");

  log("\nDocumentation:", "blue");
  log("  • PER Configuration Guide: ./PER_CONFIGURATION.md", "cyan");
  log("  • SDK Documentation: ./packages/sdk/README.md", "cyan");
  log("  • MagicBlock Docs: https://docs.magicblock.gg", "cyan");

  log("\n✅ Configuration test completed!\n", "green");
}

// Run the test
testPERConfiguration().catch((error) => {
  log(`\n❌ Fatal error: ${error instanceof Error ? error.message : "Unknown error"}`, "red");
  console.error(error);
  process.exit(1);
});
