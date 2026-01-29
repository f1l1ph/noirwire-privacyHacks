#!/usr/bin/env ts-node

/**
 * Simple Pool Initialization Script for Devnet
 *
 * Usage:
 *   ANCHOR_WALLET=.devnet-keypair.json ANCHOR_PROVIDER_URL=https://api.devnet.solana.com yarn ts-node scripts/init-pool-simple.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🚀 Initializing NoirWire Shielded Pool on Devnet\n");

// Setup provider from environment
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const connection = provider.connection;
const wallet = provider.wallet;

console.log(`📡 RPC: ${connection.rpcEndpoint}`);
console.log(`💰 Wallet: ${wallet.publicKey.toBase58()}\n`);

// Check balance
const balance = await connection.getBalance(wallet.publicKey);
console.log(`💵 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

if (balance < 0.1 * LAMPORTS_PER_SOL) {
  console.error("❌ Insufficient balance. Need at least 0.1 SOL for initialization.");
  process.exit(1);
}

// Load programs using workspace
const shieldedPoolProgram = anchor.workspace.ShieldedPool;
console.log(`\n✅ Shielded Pool Program: ${shieldedPoolProgram.programId.toBase58()}`);

// Token mint (native SOL wrapped token)
const TOKEN_MINT = new PublicKey("So11111111111111111111111111111111111111112");
console.log(`💰 Token Mint: ${TOKEN_MINT.toBase58()}`);

// PER Authority (placeholder for now)
const PER_AUTHORITY = wallet.publicKey; // Using wallet as authority for now
console.log(`🔐 PER Authority: ${PER_AUTHORITY.toBase58()}\n`);

// Load verification key hash
const depositVkPath = path.join(__dirname, "../../noir-circuits/deposit_vk.json");
let vkHash: number[];

if (fs.existsSync(depositVkPath)) {
  const vkData = JSON.parse(fs.readFileSync(depositVkPath, "utf-8"));
  vkHash = Array.from(createHash("sha256").update(JSON.stringify(vkData)).digest());
  console.log(`🔑 VK Hash (from deposit_vk.json): ${Buffer.from(vkHash).toString("hex").slice(0, 16)}...`);
} else {
  // Use placeholder hash
  vkHash = Array(32).fill(0);
  console.log(`⚠️  Using placeholder VK hash (deposit_vk.json not found)`);
}

// Derive PDAs
const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), TOKEN_MINT.toBuffer()],
  shieldedPoolProgram.programId,
);

const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), poolPda.toBuffer()],
  shieldedPoolProgram.programId,
);

const [poolAuthorityPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("authority"), poolPda.toBuffer()],
  shieldedPoolProgram.programId,
);

const [historicalRootsPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("historical_roots"), poolPda.toBuffer()],
  shieldedPoolProgram.programId,
);

console.log(`\n📍 Derived PDAs:`);
console.log(`   Pool:             ${poolPda.toBase58()}`);
console.log(`   Vault:            ${vaultPda.toBase58()}`);
console.log(`   Pool Authority:   ${poolAuthorityPda.toBase58()}`);
console.log(`   Historical Roots: ${historicalRootsPda.toBase58()}\n`);

// Check if pool already exists
const poolAccount = await connection.getAccountInfo(poolPda);
if (poolAccount) {
  console.log("⚠️  Pool already initialized!");
} else {
  console.log("📋 Step 1: Initializing shielded pool...");

  try {
    const initTx = await shieldedPoolProgram.methods
      .initialize(TOKEN_MINT, vkHash, PER_AUTHORITY)
      .accounts({
        pool: poolPda,
        tokenMint: TOKEN_MINT,
        poolVault: vaultPda,
        poolAuthority: poolAuthorityPda,
        authority: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Pool initialized! Tx: ${initTx}`);
  } catch (error: any) {
    console.error(`❌ Failed to initialize pool:`, error.message || error);
    process.exit(1);
  }
}

// Check if historical roots already exists
const historicalRootsAccount = await connection.getAccountInfo(historicalRootsPda);
if (historicalRootsAccount) {
  console.log("\n⚠️  Historical roots already initialized!");
} else {
  console.log("\n📋 Step 2: Initializing historical roots (900-root buffer)...");

  try {
    const initHistoricalRootsTx = await shieldedPoolProgram.methods
      .initHistoricalRoots()
      .accounts({
        pool: poolPda,
        historicalRoots: historicalRootsPda,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Historical roots initialized! Tx: ${initHistoricalRootsTx}`);
    console.log(`📜 Capacity: 900 roots (~6 minutes at 0.4s/slot)`);
  } catch (error: any) {
    console.error(`❌ Failed to initialize historical roots:`, error.message || error);
    process.exit(1);
  }
}

console.log("\n🎉 ========================================");
console.log("🎉 NoirWire Shielded Pool Initialized!");
console.log("🎉 ========================================");
console.log(`\n📍 Addresses:`);
console.log(`   Pool:             ${poolPda.toBase58()}`);
console.log(`   Historical Roots: ${historicalRootsPda.toBase58()}`);
console.log(`   Token Mint:       ${TOKEN_MINT.toBase58()}`);
console.log(`   PER Authority:    ${PER_AUTHORITY.toBase58()}`);
console.log(`\n💡 Next step: Deploy VKs using:`);
console.log(`   ANCHOR_WALLET=.devnet-keypair.json ANCHOR_PROVIDER_URL=https://api.devnet.solana.com yarn generate-and-deploy-vks --deploy-only\n`);
