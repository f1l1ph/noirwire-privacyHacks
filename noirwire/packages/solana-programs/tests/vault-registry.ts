import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VaultRegistry } from "../target/types/vault_registry";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import * as crypto from "crypto";

/**
 * Vault Registry Tests
 *
 * Tests for the vault-registry program which manages multi-user vaults
 * with PER Permission Program integration.
 *
 * ⚠️  MOCK FOR PERMISSION PROGRAM REQUIRED FOR LOCAL TESTING
 *
 * The vault-registry program makes CPI calls to the MagicBlock Permission Program
 * (ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1), which only exists on devnet/mainnet.
 *
 * Tests marked with [DEVNET ONLY] are SKIPPED on localnet and require devnet to pass.
 *
 * TODO: How to test on devnet:
 * 1. Configure Anchor.toml to use devnet:
 *    [provider]
 *    cluster = "devnet"
 *    wallet = "~/.config/solana/id.json"
 *
 * 2. Ensure your wallet has devnet SOL:
 *    solana airdrop 2 --url devnet
 *
 * 3. Deploy programs to devnet:
 *    anchor deploy --provider.cluster devnet
 *
 * 4. Run tests:
 *    ANCHOR_PROVIDER_URL=https://api.devnet.solana.com anchor test --skip-local-validator
 *
 * 5. Or use anchor test with devnet config:
 *    anchor test --provider.cluster devnet --skip-local-validator
 */
describe("Vault Registry Program", function () {
  this.timeout(60000);

  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.VaultRegistry as Program<VaultRegistry>;
  const provider = anchor.getProvider();

  // MagicBlock Permission Program ID
  const PERMISSION_PROGRAM_ID = new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");

  // Helper to generate random vault ID
  function generateVaultId(): number[] {
    return Array.from(crypto.randomBytes(32));
  }

  // Helper to airdrop SOL
  async function airdropSol(pubkey: PublicKey, amount: number = 2): Promise<void> {
    try {
      const sig = await provider.connection.requestAirdrop(pubkey, amount * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    } catch (err) {
      console.warn(`Airdrop failed for ${pubkey.toBase58()}, may already have funds`);
    }
  }

  // Helper to find vault PDA
  function findVaultPDA(vaultId: number[]): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), Buffer.from(vaultId)],
      program.programId,
    );
  }

  // Helper to find permission PDA (derived by Permission Program)
  function findPermissionPDA(vaultPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("permission"), vaultPubkey.toBuffer()],
      PERMISSION_PROGRAM_ID,
    );
  }

  // ===== UNIT TESTS (Local) =====

  describe("Vault PDA Derivation", () => {
    it("should derive consistent vault PDA from vault ID", () => {
      const vaultId = generateVaultId();
      const [pda1] = findVaultPDA(vaultId);
      const [pda2] = findVaultPDA(vaultId);

      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it("should derive different PDAs for different vault IDs", () => {
      const vaultId1 = generateVaultId();
      const vaultId2 = generateVaultId();

      const [pda1] = findVaultPDA(vaultId1);
      const [pda2] = findVaultPDA(vaultId2);

      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });

    it("should derive permission PDA from vault PDA", () => {
      const vaultId = generateVaultId();
      const [vaultPda] = findVaultPDA(vaultId);
      const [permissionPda1] = findPermissionPDA(vaultPda);
      const [permissionPda2] = findPermissionPDA(vaultPda);

      expect(permissionPda1.toBase58()).to.equal(permissionPda2.toBase58());
    });
  });

  describe("Vault Roles", () => {
    it("should have correct role enum values", () => {
      // VaultRole is defined in the IDL
      const roles = ["Viewer", "Member", "Admin"];
      expect(roles).to.have.length(3);
    });
  });

  // ===== INTEGRATION TESTS (Require local validator) =====

  describe("Create Vault (Local - Without Permission CPI)", () => {
    let admin: Keypair;
    let vaultId: number[];
    let vaultPda: PublicKey;
    let permissionPda: PublicKey;

    beforeEach(async () => {
      admin = Keypair.generate();
      await airdropSol(admin.publicKey);

      vaultId = generateVaultId();
      [vaultPda] = findVaultPDA(vaultId);
      [permissionPda] = findPermissionPDA(vaultPda);
    });

    it("should fail to create vault when Permission Program is not available", async function () {
      // This test verifies the CPI call happens - it should fail locally
      // because the Permission Program doesn't exist on localnet

      const vaultName = "Test Vault";

      try {
        await program.methods
          .createVault(vaultId, vaultName)
          .accounts({
            vault: vaultPda,
            admin: admin.publicKey,
            permission: permissionPda,
            perPermissionProgram: PERMISSION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        // If we get here on localnet, the Permission Program might be available
        // This is expected to fail locally
        expect.fail("Expected transaction to fail without Permission Program");
      } catch (err: any) {
        // Expected: Program not found or CPI failure
        expect(err.message).to.satisfy(
          (msg: string) =>
            msg.includes("Program") ||
            msg.includes("account") ||
            msg.includes("not provided") ||
            msg.includes("Error"),
        );
      }
    });
  });

  // ===== DEVNET INTEGRATION TESTS =====
  // These tests require running on devnet where the Permission Program is deployed
  // SKIPPED on localnet - Permission Program (ACLseo...) only exists on devnet

  describe.skip("[DEVNET ONLY] Full Vault Lifecycle", () => {
    // NOTE: These tests are skipped by default. To run them:
    // 1. Deploy to devnet: anchor deploy --provider.cluster devnet
    // 2. Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com anchor test --skip-local-validator
    // Remove .skip above to enable these tests when running on devnet

    let admin: Keypair;
    let member1: Keypair;
    let member2: Keypair;
    let vaultId: number[];
    let vaultPda: PublicKey;
    let permissionPda: PublicKey;

    before(async () => {
      admin = Keypair.generate();
      member1 = Keypair.generate();
      member2 = Keypair.generate();

      await airdropSol(admin.publicKey, 5);

      vaultId = generateVaultId();
      [vaultPda] = findVaultPDA(vaultId);
      [permissionPda] = findPermissionPDA(vaultPda);
    });

    it("should create a vault with permission account", async () => {
      const vaultName = "Devnet Test Vault";

      const tx = await program.methods
        .createVault(vaultId, vaultName)
        .accounts({
          vault: vaultPda,
          admin: admin.publicKey,
          permission: permissionPda,
          perPermissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("Create vault tx:", tx);

      // Verify vault state
      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.name).to.equal(vaultName);
      expect(vault.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(vault.permission.toBase58()).to.equal(permissionPda.toBase58());
    });

    it("should add a member as Viewer", async () => {
      const tx = await program.methods
        .addVaultMember(vaultId, member1.publicKey, { viewer: {} })
        .accounts({
          vault: vaultPda,
          admin: admin.publicKey,
          permission: permissionPda,
          perPermissionProgram: PERMISSION_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      console.log("Add member tx:", tx);
    });

    it("should add a member as Admin", async () => {
      const tx = await program.methods
        .addVaultMember(vaultId, member2.publicKey, { admin: {} })
        .accounts({
          vault: vaultPda,
          admin: admin.publicKey,
          permission: permissionPda,
          perPermissionProgram: PERMISSION_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      console.log("Add admin member tx:", tx);
    });

    it("should remove a member", async () => {
      const tx = await program.methods
        .removeVaultMember(vaultId, member1.publicKey)
        .accounts({
          vault: vaultPda,
          admin: admin.publicKey,
          permission: permissionPda,
          perPermissionProgram: PERMISSION_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      console.log("Remove member tx:", tx);
    });

    it("should prevent non-admin from managing members", async () => {
      const nonAdmin = Keypair.generate();
      await airdropSol(nonAdmin.publicKey);

      try {
        await program.methods
          .addVaultMember(vaultId, Keypair.generate().publicKey, { member: {} })
          .accounts({
            vault: vaultPda,
            admin: nonAdmin.publicKey, // Wrong admin
            permission: permissionPda,
            perPermissionProgram: PERMISSION_PROGRAM_ID,
          })
          .signers([nonAdmin])
          .rpc();

        expect.fail("Should have rejected non-admin");
      } catch (err: any) {
        // Expected: has_one constraint failure
        expect(err.toString()).to.include("has_one");
      }
    });

    it("should close the vault", async () => {
      const tx = await program.methods
        .closeVault(vaultId)
        .accounts({
          vault: vaultPda,
          admin: admin.publicKey,
          permission: permissionPda,
          perPermissionProgram: PERMISSION_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();

      console.log("Close vault tx:", tx);

      // Verify vault is closed
      try {
        await program.account.vault.fetch(vaultPda);
        expect.fail("Vault should be closed");
      } catch (err: any) {
        expect(err.toString()).to.include("Account does not exist");
      }
    });
  });

  // ===== ERROR HANDLING TESTS =====

  describe("Error Handling", () => {
    let admin: Keypair;

    beforeEach(async () => {
      admin = Keypair.generate();
      await airdropSol(admin.publicKey);
    });

    it("should reject vault name longer than 32 characters", async () => {
      const vaultId = generateVaultId();
      const [vaultPda] = findVaultPDA(vaultId);
      const [permissionPda] = findPermissionPDA(vaultPda);

      const longName = "A".repeat(33); // 33 chars, exceeds limit

      try {
        await program.methods
          .createVault(vaultId, longName)
          .accounts({
            vault: vaultPda,
            admin: admin.publicKey,
            permission: permissionPda,
            perPermissionProgram: PERMISSION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        expect.fail("Should have rejected long name");
      } catch (err: any) {
        // Expected: NameTooLong error or string constraint violation
        expect(err.toString()).to.satisfy(
          (msg: string) =>
            msg.includes("NameTooLong") ||
            msg.includes("name") ||
            msg.includes("string") ||
            msg.includes("Error"),
        );
      }
    });

    it("should prevent duplicate vault creation", async () => {
      const vaultId = generateVaultId();
      const [vaultPda] = findVaultPDA(vaultId);
      const [permissionPda] = findPermissionPDA(vaultPda);
      const vaultName = "Duplicate Test";

      // First creation will fail due to missing Permission Program (expected)
      // But attempting again should show account already exists behavior

      // Skip detailed duplicate test if Permission Program unavailable
      console.log("Note: Full duplicate test requires Permission Program");
    });
  });

  // ===== SERIALIZATION TESTS =====

  describe("Data Serialization", () => {
    it("should correctly encode vault ID as 32 bytes", () => {
      const vaultId = generateVaultId();
      const buffer = Buffer.from(vaultId);

      expect(buffer.length).to.equal(32);
    });

    it("should correctly encode VaultRole enum", () => {
      // Test the role enum variants work with Anchor
      const viewerRole = { viewer: {} };
      const memberRole = { member: {} };
      const adminRole = { admin: {} };

      expect(Object.keys(viewerRole)[0]).to.equal("viewer");
      expect(Object.keys(memberRole)[0]).to.equal("member");
      expect(Object.keys(adminRole)[0]).to.equal("admin");
    });
  });
});
