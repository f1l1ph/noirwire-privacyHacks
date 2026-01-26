/**
 * Noirwire Load Testing Script
 *
 * Tests the performance and stability of the shielded pool under load.
 * Run with: npx ts-node scripts/load-test.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { ShieldedPool } from "../target/types/shielded_pool";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

// Configuration
const CONFIG = {
  // Network
  RPC_URL: process.env.RPC_URL || "http://127.0.0.1:8899",

  // Load test parameters
  CONCURRENT_USERS: 10,
  OPERATIONS_PER_USER: 20,
  OPERATION_DELAY_MS: 100,

  // Test modes
  TEST_DEPOSITS: true,
  TEST_WITHDRAWALS: true,
  TEST_PAUSED_STATE: true,
};

interface LoadTestResults {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  throughputTps: number;
  durationSeconds: number;
  errorBreakdown: Record<string, number>;
}

interface TestContext {
  provider: anchor.AnchorProvider;
  program: Program<ShieldedPool>;
  admin: Keypair;
  tokenMint: PublicKey;
  poolState: PublicKey;
  poolVault: PublicKey;
  poolAuthority: PublicKey;
}

class LoadTester {
  private results: LoadTestResults = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    averageLatencyMs: 0,
    maxLatencyMs: 0,
    minLatencyMs: Infinity,
    throughputTps: 0,
    durationSeconds: 0,
    errorBreakdown: {},
  };

  private latencies: number[] = [];
  private startTime: number = 0;

  constructor(private ctx: TestContext) {}

  async runLoadTest(): Promise<LoadTestResults> {
    console.log("\n🚀 Starting Noirwire Load Test");
    console.log("═".repeat(50));
    console.log(`   RPC URL: ${CONFIG.RPC_URL}`);
    console.log(`   Concurrent Users: ${CONFIG.CONCURRENT_USERS}`);
    console.log(`   Operations per User: ${CONFIG.OPERATIONS_PER_USER}`);
    console.log(`   Total Operations: ${CONFIG.CONCURRENT_USERS * CONFIG.OPERATIONS_PER_USER}`);
    console.log("═".repeat(50));

    this.startTime = Date.now();

    // Create test users
    const users = await this.createTestUsers(CONFIG.CONCURRENT_USERS);

    // Run concurrent operations
    const userPromises = users.map((user, idx) => this.runUserOperations(user, idx));

    await Promise.all(userPromises);

    // Calculate final results
    this.calculateResults();

    return this.results;
  }

  private async createTestUsers(count: number): Promise<Keypair[]> {
    console.log(`\n📝 Creating ${count} test users...`);
    const users: Keypair[] = [];

    for (let i = 0; i < count; i++) {
      const user = Keypair.generate();

      // Airdrop SOL
      try {
        const sig = await this.ctx.provider.connection.requestAirdrop(
          user.publicKey,
          2 * LAMPORTS_PER_SOL,
        );
        await this.ctx.provider.connection.confirmTransaction(sig, "confirmed");
      } catch (e) {
        console.warn(`   ⚠️ Airdrop failed for user ${i}, retrying...`);
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const sig = await this.ctx.provider.connection.requestAirdrop(
            user.publicKey,
            2 * LAMPORTS_PER_SOL,
          );
          await this.ctx.provider.connection.confirmTransaction(sig, "confirmed");
        } catch (e2) {
          console.error(`   ❌ Airdrop failed again for user ${i}`);
        }
      }

      // Create token account and mint tokens
      const tokenAccount = await createAccount(
        this.ctx.provider.connection,
        user,
        this.ctx.tokenMint,
        user.publicKey,
      );

      await mintTo(
        this.ctx.provider.connection,
        this.ctx.admin,
        this.ctx.tokenMint,
        tokenAccount,
        this.ctx.admin,
        1_000_000_000_000, // 1M tokens
      );

      users.push(user);

      if ((i + 1) % 5 === 0) {
        console.log(`   Created ${i + 1}/${count} users`);
      }
    }

    console.log(`   ✅ Created ${count} test users`);
    return users;
  }

  private async runUserOperations(user: Keypair, userIndex: number): Promise<void> {
    for (let i = 0; i < CONFIG.OPERATIONS_PER_USER; i++) {
      const operation = this.selectRandomOperation();

      const startTime = Date.now();
      let success = false;
      let errorType = "";

      try {
        await this.executeOperation(operation, user);
        success = true;
      } catch (err: any) {
        errorType = this.categorizeError(err);
      }

      const latency = Date.now() - startTime;
      this.recordResult(success, latency, errorType);

      // Add delay between operations
      await new Promise((r) => setTimeout(r, CONFIG.OPERATION_DELAY_MS));
    }
  }

  private selectRandomOperation(): string {
    const operations: string[] = [];

    if (CONFIG.TEST_DEPOSITS) operations.push("deposit");
    if (CONFIG.TEST_WITHDRAWALS) operations.push("withdraw");
    if (CONFIG.TEST_PAUSED_STATE) operations.push("check_paused");

    return operations[Math.floor(Math.random() * operations.length)];
  }

  private async executeOperation(operation: string, user: Keypair): Promise<void> {
    switch (operation) {
      case "deposit":
        await this.simulateDeposit(user);
        break;
      case "withdraw":
        await this.simulateWithdraw(user);
        break;
      case "check_paused":
        await this.checkPoolState();
        break;
    }
  }

  private async simulateDeposit(user: Keypair): Promise<void> {
    // Simulate a deposit by reading pool state
    // In a real test with valid proofs, this would call the deposit instruction
    const pool = await this.ctx.program.account.poolState.fetch(this.ctx.poolState);

    if (pool.paused) {
      throw new Error("PoolPaused");
    }

    // Simulate work
    await new Promise((r) => setTimeout(r, 10));
  }

  private async simulateWithdraw(user: Keypair): Promise<void> {
    // Simulate a withdrawal by reading pool state
    const pool = await this.ctx.program.account.poolState.fetch(this.ctx.poolState);

    if (pool.paused) {
      throw new Error("PoolPaused");
    }

    // Simulate work
    await new Promise((r) => setTimeout(r, 10));
  }

  private async checkPoolState(): Promise<void> {
    const pool = await this.ctx.program.account.poolState.fetch(this.ctx.poolState);
    // Just reading state
  }

  private categorizeError(err: any): string {
    const message = err.message || err.toString();

    if (message.includes("PoolPaused")) return "PoolPaused";
    if (message.includes("InsufficientFunds")) return "InsufficientFunds";
    if (message.includes("blockhash")) return "BlockhashExpired";
    if (message.includes("timeout")) return "Timeout";
    if (message.includes("rate limit")) return "RateLimited";

    return "Unknown";
  }

  private recordResult(success: boolean, latencyMs: number, errorType: string): void {
    this.results.totalOperations++;
    this.latencies.push(latencyMs);

    if (success) {
      this.results.successfulOperations++;
    } else {
      this.results.failedOperations++;
      this.results.errorBreakdown[errorType] = (this.results.errorBreakdown[errorType] || 0) + 1;
    }

    if (latencyMs > this.results.maxLatencyMs) {
      this.results.maxLatencyMs = latencyMs;
    }
    if (latencyMs < this.results.minLatencyMs) {
      this.results.minLatencyMs = latencyMs;
    }
  }

  private calculateResults(): void {
    this.results.durationSeconds = (Date.now() - this.startTime) / 1000;

    if (this.latencies.length > 0) {
      const sum = this.latencies.reduce((a, b) => a + b, 0);
      this.results.averageLatencyMs = sum / this.latencies.length;
    }

    if (this.results.durationSeconds > 0) {
      this.results.throughputTps = this.results.successfulOperations / this.results.durationSeconds;
    }

    if (this.results.minLatencyMs === Infinity) {
      this.results.minLatencyMs = 0;
    }
  }

  printResults(): void {
    console.log("\n📊 Load Test Results");
    console.log("═".repeat(50));
    console.log(`   Duration: ${this.results.durationSeconds.toFixed(2)}s`);
    console.log(`   Total Operations: ${this.results.totalOperations}`);
    console.log(
      `   Successful: ${this.results.successfulOperations} (${((this.results.successfulOperations / this.results.totalOperations) * 100).toFixed(1)}%)`,
    );
    console.log(
      `   Failed: ${this.results.failedOperations} (${((this.results.failedOperations / this.results.totalOperations) * 100).toFixed(1)}%)`,
    );
    console.log("");
    console.log(`   Throughput: ${this.results.throughputTps.toFixed(2)} ops/sec`);
    console.log(`   Avg Latency: ${this.results.averageLatencyMs.toFixed(2)}ms`);
    console.log(`   Min Latency: ${this.results.minLatencyMs.toFixed(2)}ms`);
    console.log(`   Max Latency: ${this.results.maxLatencyMs.toFixed(2)}ms`);

    if (Object.keys(this.results.errorBreakdown).length > 0) {
      console.log("");
      console.log("   Error Breakdown:");
      for (const [error, count] of Object.entries(this.results.errorBreakdown)) {
        console.log(`     - ${error}: ${count}`);
      }
    }

    console.log("═".repeat(50));

    // Pass/Fail determination
    const successRate = this.results.successfulOperations / this.results.totalOperations;
    if (successRate >= 0.95) {
      console.log("✅ PASS: Success rate >= 95%");
    } else if (successRate >= 0.9) {
      console.log("⚠️  WARN: Success rate 90-95%");
    } else {
      console.log("❌ FAIL: Success rate < 90%");
    }
  }
}

async function main(): Promise<void> {
  // Setup Anchor provider
  const connection = new Connection(CONFIG.RPC_URL, "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.ShieldedPool as Program<ShieldedPool>;

  // Create admin keypair
  const admin = Keypair.generate();

  console.log("🔧 Setting up test environment...");

  // Airdrop to admin
  const airdropSig = await connection.requestAirdrop(admin.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdropSig, "confirmed");

  // Create token mint
  const tokenMint = await createMint(connection, admin, admin.publicKey, null, 6);

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

  // Initialize pool
  const VK_HASH = Array.from(Buffer.alloc(32, "vk_hash_test"));
  await program.methods
    .initialize(tokenMint, VK_HASH, Keypair.generate().publicKey)
    .accounts({
      pool: poolState,
      tokenMint: tokenMint,
      poolVault: poolVault,
      poolAuthority: poolAuthority,
      authority: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([admin])
    .rpc();

  console.log("✅ Test environment ready");
  console.log(`   Pool: ${poolState.toBase58()}`);
  console.log(`   Token Mint: ${tokenMint.toBase58()}`);

  // Create test context
  const ctx: TestContext = {
    provider,
    program,
    admin,
    tokenMint,
    poolState,
    poolVault,
    poolAuthority,
  };

  // Run load test
  const tester = new LoadTester(ctx);
  await tester.runLoadTest();
  tester.printResults();
}

main().catch((err) => {
  console.error("❌ Load test failed:", err);
  process.exit(1);
});
