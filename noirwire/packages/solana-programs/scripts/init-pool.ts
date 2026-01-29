#!/usr/bin/env ts-node

/**
 * Initialize NoirWire Shielded Pool on localnet/devnet
 *
 * This script:
 * 1. Deploys verification keys (VKs) if needed
 * 2. Initializes the shielded pool
 * 3. Initializes the historical roots PDA
 *
 * Usage:
 *   yarn init-pool              # Uses localnet (default)
 *   yarn init-pool --devnet     # Uses devnet
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const useDevnet = args.includes("--devnet");
const cluster = useDevnet ? "devnet" : "localnet";
const rpcUrl = useDevnet ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899";

console.log(`🚀 Initializing NoirWire Shielded Pool on ${cluster}`);
console.log(`📡 RPC: ${rpcUrl}\n`);

// Load wallet
const walletPath =
  process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
const walletKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8"))),
);

// Setup connection and provider
const connection = new Connection(rpcUrl, "confirmed");
const wallet = new anchor.Wallet(walletKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

// Load program using anchor workspace
const idlPath = path.join(__dirname, "../target/idl/shielded_pool.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
const programId = new PublicKey("NWRZDZJMfUAd3iVvdMhpsKht5bgHZGPzynHhQ2JssQ2");
const program = new Program(idl, programId, provider);
const SHIELDED_POOL_PROGRAM_ID = programId;

// Token mint (native SOL wrapped token)
const TOKEN_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// PER Authority (for now, use a placeholder - in production this would be the MagicBlock PER authority)
const PER_AUTHORITY = Keypair.generate().publicKey; // TODO: Replace with actual PER authority

async function main() {
  try {
    console.log(`💰 Wallet: ${wallet.publicKey.toBase58()}`);

    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`💵 Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);

    if (balance < 0.1 * LAMPORTS_PER_SOL) {
      console.error("❌ Insufficient balance. Need at least 0.1 SOL for initialization.");
      if (!useDevnet) {
        console.log("💡 Try: solana airdrop 1 --url http://127.0.0.1:8899");
      }
      process.exit(1);
    }

    // Step 1: Deploy/load verification key
    console.log("📋 Step 1: Loading verification key...");
    const depositVkPath = path.join(__dirname, "../../noir-circuits/deposit_vk.json");

    if (!fs.existsSync(depositVkPath)) {
      console.error(
        "❌ Verification key not found. Run: cd packages/noir-circuits && nargo compile",
      );
      process.exit(1);
    }

    const vkData = JSON.parse(fs.readFileSync(depositVkPath, "utf-8"));
    console.log("✅ Verification key loaded");

    // Calculate VK hash (using simplified approach for now)
    const vkHash = Array.from(createHash("sha256").update(JSON.stringify(vkData)).digest());
    console.log(`🔑 VK Hash: ${Buffer.from(vkHash).toString("hex").slice(0, 16)}...\n`);

    // Step 2: Derive pool PDA
    console.log("📋 Step 2: Deriving pool PDA...");
    const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), TOKEN_MINT.toBuffer()],
      SHIELDED_POOL_PROGRAM_ID,
    );
    console.log(`🏦 Pool PDA: ${poolPda.toBase58()}`);

    // Check if pool already exists
    const poolAccount = await connection.getAccountInfo(poolPda);
    if (poolAccount) {
      console.log("⚠️  Pool already initialized!\n");
    } else {
      // Step 3: Initialize pool
      console.log("\n📋 Step 3: Initializing shielded pool...");

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), poolPda.toBuffer()],
        SHIELDED_POOL_PROGRAM_ID,
      );

      const [poolAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("authority"), poolPda.toBuffer()],
        SHIELDED_POOL_PROGRAM_ID,
      );

      const initTx = await program.methods
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
      console.log(`🏦 Pool: ${poolPda.toBase58()}`);
      console.log(`🔐 Vault: ${vaultPda.toBase58()}`);
      console.log(`👤 Authority: ${poolAuthorityPda.toBase58()}\n`);
    }

    // Step 4: Initialize historical roots PDA
    console.log("📋 Step 4: Initializing historical roots PDA...");
    const [historicalRootsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("historical_roots"), poolPda.toBuffer()],
      SHIELDED_POOL_PROGRAM_ID,
    );
    console.log(`📜 Historical Roots PDA: ${historicalRootsPda.toBase58()}`);

    // Check if historical roots already exists
    const historicalRootsAccount = await connection.getAccountInfo(historicalRootsPda);
    if (historicalRootsAccount) {
      console.log("⚠️  Historical roots already initialized!\n");
    } else {
      console.log("Initializing historical roots (900-root buffer for 6-minute window)...");

      const initHistoricalRootsTx = await program.methods
        .initHistoricalRoots()
        .accounts({
          pool: poolPda,
          historicalRoots: historicalRootsPda,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Historical roots initialized! Tx: ${initHistoricalRootsTx}`);
      console.log(`📜 Capacity: 900 roots (~6 minutes at 0.4s/slot)\n`);
    }

    // Summary
    console.log("🎉 ========================================");
    console.log("🎉 NoirWire Shielded Pool Initialized!");
    console.log("🎉 ========================================");
    console.log(`\n📍 Addresses:`);
    console.log(`   Pool:             ${poolPda.toBase58()}`);
    console.log(`   Historical Roots: ${historicalRootsPda.toBase58()}`);
    console.log(`   Token Mint:       ${TOKEN_MINT.toBase58()}`);
    console.log(`   PER Authority:    ${PER_AUTHORITY.toBase58()}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Update .env.local with deployed addresses`);
    console.log(`   2. Start the web app: cd apps/web && yarn dev`);
    console.log(`   3. Test deposit/withdraw flows\n`);
  } catch (error) {
    console.error("\n❌ Error during initialization:");
    console.error(error);
    process.exit(1);
  }
}

main();
