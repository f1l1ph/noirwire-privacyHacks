/**
 * Initialize Shielded Pool on Solana
 *
 * This script initializes the shielded pool with:
 * 1. Token mint (Native SOL)
 * 2. Verification key hash
 * 3. PER authority
 *
 * Usage:
 *   yarn ts-node scripts/initialize-pool.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import { keccak_256 } from "js-sha3";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Initializing NoirWire Shielded Pool...\n");

  // Configure provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load program
  const program = anchor.workspace.ShieldedPool as Program;
  console.log(`Program ID: ${program.programId.toBase58()}`);

  // Token mint - using Native SOL
  const tokenMint = NATIVE_MINT;
  console.log(`Token Mint: ${tokenMint.toBase58()} (Native SOL)`);

  // Load verification key and compute hash
  const vkPath = path.join(__dirname, "../../noir-circuits/deposit_vk.json");

  let vkHash: number[];
  if (fs.existsSync(vkPath)) {
    const vkData = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
    const vkString = JSON.stringify(vkData);
    const hashBytes = keccak_256(vkString);
    vkHash = Array.from(Buffer.from(hashBytes, "hex"));
    console.log(`VK Hash: 0x${hashBytes.substring(0, 16)}...`);
  } else {
    // Use placeholder for testing
    vkHash = Array.from(Buffer.alloc(32, 42));
    console.log("⚠️  Using placeholder VK hash (VK file not found)");
  }

  // PER authority - for now use a test keypair (replace with actual PER authority)
  const perAuthority = Keypair.generate().publicKey;
  console.log(`PER Authority: ${perAuthority.toBase58()}`);
  console.log("⚠️  Using test PER authority - replace with actual MagicBlock PER address\n");

  // Derive PDAs
  const [poolState] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), tokenMint.toBuffer()],
    program.programId,
  );
  const [poolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), poolState.toBuffer()],
    program.programId,
  );
  const [poolAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("authority"), poolState.toBuffer()],
    program.programId,
  );

  console.log("📍 Derived PDAs:");
  console.log(`   Pool State: ${poolState.toBase58()}`);
  console.log(`   Pool Vault: ${poolVault.toBase58()}`);
  console.log(`   Pool Authority: ${poolAuthority.toBase58()}\n`);

  // Check if pool already exists
  try {
    const poolAccount = await program.account.poolState.fetch(poolState);
    console.log("⚠️  Pool already initialized!");
    console.log(`   Authority: ${poolAccount.authority.toBase58()}`);
    console.log(`   Total Shielded: ${poolAccount.totalShielded.toString()}`);
    console.log(`   Total Deposits: ${poolAccount.totalDeposits.toString()}`);
    return;
  } catch (err) {
    // Pool doesn't exist, continue with initialization
  }

  // Initialize pool
  console.log("⏳ Sending initialization transaction...");
  try {
    const tx = await program.methods
      .initialize(tokenMint, vkHash, perAuthority)
      .accounts({
        pool: poolState,
        tokenMint: tokenMint,
        poolVault: poolVault,
        poolAuthority: poolAuthority,
        authority: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("✅ Pool initialized successfully!");
    console.log(`   Transaction: ${tx}\n`);

    // Verify initialization
    const poolAccount = await program.account.poolState.fetch(poolState);
    console.log("📊 Pool State:");
    console.log(`   Version: ${poolAccount.version}`);
    console.log(`   Authority: ${poolAccount.authority.toBase58()}`);
    console.log(`   PER Authority: ${poolAccount.perAuthority.toBase58()}`);
    console.log(`   Token Mint: ${poolAccount.tokenMint.toBase58()}`);
    console.log(`   Total Shielded: ${poolAccount.totalShielded.toString()}`);
    console.log(`   Paused: ${poolAccount.paused}`);

    // Save pool info to file
    const poolInfo = {
      network: provider.connection.rpcEndpoint,
      poolState: poolState.toBase58(),
      poolVault: poolVault.toBase58(),
      poolAuthority: poolAuthority.toBase58(),
      tokenMint: tokenMint.toBase58(),
      perAuthority: perAuthority.toBase58(),
      authority: provider.wallet.publicKey.toBase58(),
      timestamp: new Date().toISOString(),
    };

    const outputPath = path.join(__dirname, "../.pool-info.json");
    fs.writeFileSync(outputPath, JSON.stringify(poolInfo, null, 2));
    console.log(`\n💾 Pool info saved to: ${outputPath}`);
  } catch (error) {
    console.error("❌ Failed to initialize pool:");
    console.error(error);
    process.exit(1);
  }

  console.log("\n✅ Initialization complete!");
  console.log("\n📝 Next steps:");
  console.log("   1. Deploy verification keys: yarn ts-node scripts/deploy-vks.ts");
  console.log("   2. Initialize historical roots: yarn ts-node scripts/init-historical-roots.ts");
  console.log("   3. Update .env files with pool addresses");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
