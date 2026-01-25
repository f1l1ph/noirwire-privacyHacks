import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ShieldedPool } from "../target/types/shielded_pool";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("Shielded Pool Program", function () {
  // Set timeout for the entire suite
  this.timeout(60000);

  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.ShieldedPool as Program<ShieldedPool>;
  const provider = anchor.getProvider();

  const VK_HASH = Array.from(Buffer.alloc(32, "vk_hash_test"));

  // PER (Private Ephemeral Rollup) authority for batch settlements
  // In tests, we use a deterministic keypair for simplicity
  const PER_AUTHORITY = Keypair.generate().publicKey;

  // Helper function to generate test keypairs
  function generateKeypair(): Keypair {
    return Keypair.generate();
  }

  // Helper to airdrop and confirm with timeout
  async function airdropSol(pubkey: PublicKey, amount: number = 10): Promise<void> {
    try {
      const sig = await provider.connection.requestAirdrop(
        pubkey,
        amount * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    } catch (err) {
      console.warn(`Airdrop failed for ${pubkey.toBase58()}, may already have funds`);
    }
  }

  // Helper function to find PDA
  function findPoolPDA(mint: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), mint.toBuffer()],
      program.programId,
    );
    return pda;
  }

  function findVaultPDA(poolKey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), poolKey.toBuffer()],
      program.programId,
    );
    return pda;
  }

  function findAuthorityPDA(poolKey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), poolKey.toBuffer()],
      program.programId,
    );
    return pda;
  }

  // ===== INITIALIZATION TESTS =====

  describe("Pool Initialization", () => {
    it("should initialize pool with correct parameters", async function () {
      this.timeout(30000);

      const poolAuthority = generateKeypair();

      await airdropSol(poolAuthority.publicKey);

      // Create token mint
      const tokenMint = await createMint(
        provider.connection,
        poolAuthority,
        poolAuthority.publicKey,
        poolAuthority.publicKey,
        6,
      );

      // Derive PDAs
      const poolState = findPoolPDA(tokenMint);
      const poolAuthorityPda = findAuthorityPDA(poolState);
      const poolVault = findVaultPDA(poolState);

      await program.methods
        .initialize(tokenMint, VK_HASH, PER_AUTHORITY)
        .accounts({
          pool: poolState,
          tokenMint: tokenMint,
          poolVault: poolVault,
          poolAuthority: poolAuthorityPda,
          authority: poolAuthority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([poolAuthority])
        .rpc();

      // Verify pool state
      const pool = await program.account.poolState.fetch(poolState);
      expect(pool.authority.toBase58()).to.equal(poolAuthority.publicKey.toBase58());
      expect(pool.tokenMint.toBase58()).to.equal(tokenMint.toBase58());
      expect(pool.totalShielded.toString()).to.equal("0");
      expect(pool.paused).to.be.false;
      expect(pool.totalDeposits.toString()).to.equal("0");
      expect(pool.totalWithdrawals.toString()).to.equal("0");
      expect(pool.totalNullifiers.toString()).to.equal("0");
      expect(pool.rootsIndex).to.equal(0);

      console.log("✓ Pool initialized successfully");
    });

    it("should prevent double initialization", async function () {
      this.timeout(30000);

      const poolAuthority = generateKeypair();

      await airdropSol(poolAuthority.publicKey);

      const tokenMint = await createMint(
        provider.connection,
        poolAuthority,
        poolAuthority.publicKey,
        poolAuthority.publicKey,
        6,
      );

      const poolState = findPoolPDA(tokenMint);
      const poolAuthorityPda = findAuthorityPDA(poolState);
      const poolVault = findVaultPDA(poolState);

      // First initialization
      await program.methods
        .initialize(tokenMint, VK_HASH, PER_AUTHORITY)
        .accounts({
          pool: poolState,
          tokenMint: tokenMint,
          poolVault: poolVault,
          poolAuthority: poolAuthorityPda,
          authority: poolAuthority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([poolAuthority])
        .rpc();

      // Attempt second initialization with same pool
      try {
        await program.methods
          .initialize(tokenMint, Array.from(Buffer.alloc(32, 1)), PER_AUTHORITY)
          .accounts({
            pool: poolState,
            tokenMint: tokenMint,
            poolVault: poolVault,
            poolAuthority: poolAuthorityPda,
            authority: poolAuthority.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([poolAuthority])
          .rpc();

        expect.fail("Should have failed - account already initialized");
      } catch (err: any) {
        const errMsg = err.message || err.toString();
        expect(errMsg).to.include("already in use");
        console.log("✓ Prevented double initialization");
      }
    });
  });

  // ===== ACCESS CONTROL TESTS =====

  describe("Access Control", () => {
    it("should allow admin to pause pool", async function () {
      this.timeout(30000);

      const admin = generateKeypair();

      await airdropSol(admin.publicKey);

      const tokenMint = await createMint(
        provider.connection,
        admin,
        admin.publicKey,
        admin.publicKey,
        6,
      );

      const pool = findPoolPDA(tokenMint);
      const poolAuthorityPda = findAuthorityPDA(pool);
      const vault = findVaultPDA(pool);

      await program.methods
        .initialize(tokenMint, VK_HASH, PER_AUTHORITY)
        .accounts({
          pool: pool,
          tokenMint: tokenMint,
          poolVault: vault,
          poolAuthority: poolAuthorityPda,
          authority: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();

      await program.methods
        .setPaused(true)
        .accounts({
          pool: pool,
          authority: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      const poolState = await program.account.poolState.fetch(pool);
      expect(poolState.paused).to.be.true;

      console.log("✓ Admin successfully paused pool");
    });

    it("should prevent non-admin from pausing pool", async function () {
      this.timeout(30000);

      const admin = generateKeypair();
      const nonAdmin = generateKeypair();

      await airdropSol(admin.publicKey);
      await airdropSol(nonAdmin.publicKey);

      const tokenMint = await createMint(
        provider.connection,
        admin,
        admin.publicKey,
        admin.publicKey,
        6,
      );

      const pool = findPoolPDA(tokenMint);
      const poolAuthorityPda = findAuthorityPDA(pool);
      const vault = findVaultPDA(pool);

      await program.methods
        .initialize(tokenMint, VK_HASH, PER_AUTHORITY)
        .accounts({
          pool: pool,
          tokenMint: tokenMint,
          poolVault: vault,
          poolAuthority: poolAuthorityPda,
          authority: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();

      try {
        await program.methods
          .setPaused(true)
          .accounts({
            pool: pool,
            authority: nonAdmin.publicKey,
          })
          .signers([nonAdmin])
          .rpc();

        expect.fail("Should have rejected non-admin pause");
      } catch (err: any) {
        const errMsg = err.message || err.toString();
        const isExpectedError =
          errMsg.includes("Unauthorized") ||
          errMsg.includes("unauthorized") ||
          errMsg.includes("constraint") ||
          errMsg.includes("ConstraintHasOne");
        expect(isExpectedError, `Unexpected error: ${errMsg}`).to.be.true;
        console.log("✓ Rejected pause from non-admin");
      }
    });
  });

  // ===== PDA VERIFICATION TESTS =====

  describe("PDA Derivation and Validation", () => {
    it("should derive correct pool PDA", async function () {
      this.timeout(30000);

      const admin = generateKeypair();

      await airdropSol(admin.publicKey);

      const testMint = await createMint(
        provider.connection,
        admin,
        admin.publicKey,
        admin.publicKey,
        6,
      );

      const derivedPoolPDA1 = findPoolPDA(testMint);
      const derivedPoolPDA2 = findPoolPDA(testMint);

      // PDAs should be deterministic
      expect(derivedPoolPDA1.toBase58()).to.equal(derivedPoolPDA2.toBase58());

      console.log("✓ Pool PDA derivation is deterministic");
    });

    it("should derive unique PDAs for different mints", async function () {
      this.timeout(30000);

      const admin = generateKeypair();

      await airdropSol(admin.publicKey);

      const mint1 = await createMint(
        provider.connection,
        admin,
        admin.publicKey,
        admin.publicKey,
        6,
      );

      const mint2 = await createMint(
        provider.connection,
        admin,
        admin.publicKey,
        admin.publicKey,
        6,
      );

      const pool1 = findPoolPDA(mint1);
      const pool2 = findPoolPDA(mint2);

      expect(pool1.toBase58()).to.not.equal(pool2.toBase58());

      console.log("✓ Different mints derive different pool PDAs");
    });
  });
});
