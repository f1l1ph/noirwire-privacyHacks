/**
 * Generate and Deploy Verification Keys to Solana
 *
 * CRITICAL SECURITY: This script handles VK generation for production circuits
 * with TREE_DEPTH=24 (16M capacity).
 *
 * Steps:
 * 1. Load compiled Noir circuit artifacts (deposit, withdraw, transfer)
 * 2. Generate Groth16 verification keys using Barretenberg backend
 * 3. Parse VKs into Solana-compatible format (BN254 curve points)
 * 4. Upload VKs to the zk-verifier program on-chain
 *
 * Usage:
 *   yarn ts-node scripts/generate-and-deploy-vks.ts
 *   yarn ts-node scripts/generate-and-deploy-vks.ts --skip-deploy  # Generate only
 *   yarn ts-node scripts/generate-and-deploy-vks.ts --deploy-only  # Deploy pre-generated
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BarretenbergBackend } from "@noir-lang/backend_barretenberg";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Circuit IDs from proof.rs (keccak256 of "noirwire.{circuit}.v2")
const CIRCUIT_IDS = {
  DEPOSIT: [
    0x04, 0x8b, 0xf3, 0x55, 0x3a, 0xfe, 0x34, 0x84, 0x85, 0x27, 0x8e, 0x5e, 0x56, 0x78, 0x39, 0x12,
    0x4a, 0x80, 0xf6, 0xa5, 0x71, 0xd2, 0xb7, 0xa6, 0x44, 0xd3, 0x23, 0xbf, 0x97, 0xb4, 0x76, 0x5a,
  ],
  WITHDRAW: [
    0x07, 0x49, 0xf5, 0x64, 0xac, 0x73, 0x88, 0x92, 0x4c, 0x2c, 0xd3, 0x94, 0xd2, 0x08, 0x15, 0xe2,
    0x0e, 0xab, 0xa7, 0xf3, 0x5a, 0xf3, 0x31, 0xe3, 0x11, 0x07, 0x8d, 0x81, 0xbb, 0x78, 0xbc, 0x4e,
  ],
  TRANSFER: [
    0xbc, 0x88, 0x93, 0xac, 0x50, 0xd8, 0x33, 0x91, 0x3c, 0x65, 0x5c, 0xaf, 0x91, 0xb7, 0x74, 0xfc,
    0x99, 0x5f, 0x70, 0x42, 0x45, 0x62, 0x2e, 0xc6, 0x3d, 0x9d, 0x04, 0x27, 0x55, 0x86, 0x3f, 0x7d,
  ],
};

// Paths
const CIRCUITS_PATH = path.join(__dirname, "../../noir-circuits/target");
const VK_OUTPUT_DIR = path.join(__dirname, "../vks");

interface CircuitArtifact {
  bytecode: string;
  abi: {
    parameters: Array<{ name: string; type: any; visibility: string }>;
    return_type: any;
  };
}

interface VerificationKeyData {
  alpha_g1: number[];
  beta_g2: number[];
  gamma_g2: number[];
  delta_g2: number[];
  ic: number[][];
}

interface ParsedVK {
  numPublicInputs: number;
  data: VerificationKeyData;
}

/**
 * Load a compiled Noir circuit artifact
 */
async function loadCircuit(name: string): Promise<CircuitArtifact | null> {
  const filePath = path.join(CIRCUITS_PATH, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Circuit artifact not found: ${filePath}`);
    return null;
  }

  console.log(`  📁 Loading circuit from: ${filePath}`);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Generate verification key from circuit using Barretenberg
 *
 * SECURITY: VK generation must be deterministic and reproducible
 */
async function generateVK(circuit: CircuitArtifact, circuitName: string): Promise<ParsedVK> {
  console.log(`  🔧 Initializing Barretenberg backend...`);
  const backend = new BarretenbergBackend(circuit as any);

  try {
    console.log(`  🔑 Generating verification key...`);
    const vkRaw = await backend.getVerificationKey();

    console.log(`  📊 VK size: ${vkRaw.length} bytes`);

    const vk = parseVerificationKey(vkRaw);

    console.log(`  ✅ VK generated with ${vk.numPublicInputs} public inputs`);
    console.log(`  📈 IC points: ${vk.data.ic.length}`);

    return vk;
  } finally {
    await backend.destroy();
  }
}

/**
 * Parse Barretenberg VK binary format into Solana-compatible structure
 *
 * Barretenberg VK Format (BN254 curve):
 * - 4 bytes: num_public_inputs (u32, little-endian)
 * - 64 bytes: alpha_g1 (G1 point, uncompressed)
 * - 128 bytes: beta_g2 (G2 point, uncompressed)
 * - 128 bytes: gamma_g2 (G2 point, uncompressed)
 * - 128 bytes: delta_g2 (G2 point, uncompressed)
 * - n * 64 bytes: IC points (G1 points, n = num_public_inputs + 1)
 *
 * CRITICAL: All points must be valid curve points. Invalid points will
 * cause verification failures or (worse) security vulnerabilities.
 */
function parseVerificationKey(vkRaw: Uint8Array): ParsedVK {
  let offset = 0;

  // Read number of public inputs (4 bytes, little-endian)
  const numPublicInputs = new DataView(vkRaw.buffer, vkRaw.byteOffset).getUint32(offset, true);
  offset += 4;

  console.log(`    • Public inputs: ${numPublicInputs}`);

  // Read alpha_g1 (64 bytes - G1 point)
  const alpha_g1 = Array.from(vkRaw.slice(offset, offset + 64));
  offset += 64;

  // Read beta_g2 (128 bytes - G2 point)
  const beta_g2 = Array.from(vkRaw.slice(offset, offset + 128));
  offset += 128;

  // Read gamma_g2 (128 bytes - G2 point)
  const gamma_g2 = Array.from(vkRaw.slice(offset, offset + 128));
  offset += 128;

  // Read delta_g2 (128 bytes - G2 point)
  const delta_g2 = Array.from(vkRaw.slice(offset, offset + 128));
  offset += 128;

  // Read IC points (numPublicInputs + 1 points, 64 bytes each)
  const ic: number[][] = [];
  const numIcPoints = numPublicInputs + 1;

  for (let i = 0; i < numIcPoints; i++) {
    const icPoint = Array.from(vkRaw.slice(offset, offset + 64));
    ic.push(icPoint);
    offset += 64;
  }

  console.log(`    • Total VK size: ${offset} bytes`);
  console.log(`    • IC points: ${ic.length}`);

  // Validate we consumed all data
  if (offset !== vkRaw.length) {
    console.warn(`    ⚠️  Warning: VK has ${vkRaw.length - offset} extra bytes`);
  }

  return {
    numPublicInputs,
    data: {
      alpha_g1,
      beta_g2,
      gamma_g2,
      delta_g2,
      ic,
    },
  };
}

/**
 * Save VK to JSON file for backup/verification
 */
function saveVK(circuitName: string, vk: ParsedVK): void {
  if (!fs.existsSync(VK_OUTPUT_DIR)) {
    fs.mkdirSync(VK_OUTPUT_DIR, { recursive: true });
  }

  const filePath = path.join(VK_OUTPUT_DIR, `${circuitName}.vk.json`);

  const vkData = {
    circuit: circuitName,
    numPublicInputs: vk.numPublicInputs,
    timestamp: new Date().toISOString(),
    treeDepth: 24, // CRITICAL: Production value
    ...vk.data,
  };

  fs.writeFileSync(filePath, JSON.stringify(vkData, null, 2));
  console.log(`  💾 Saved VK to: ${filePath}`);
}

/**
 * Find pool PDA for the shielded pool program
 */
async function findPoolPDA(program: Program): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
}

/**
 * Find VK PDA for the zk-verifier program
 */
async function findVkPDA(
  zkVerifierProgram: Program,
  poolPubkey: PublicKey,
  circuitId: number[],
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vk"), poolPubkey.toBuffer(), Buffer.from(circuitId)],
    zkVerifierProgram.programId,
  );
}

/**
 * Store VK on-chain via zk-verifier program
 *
 * SECURITY CRITICAL: Only pool authority can store VKs
 */
async function storeVk(
  zkVerifierProgram: Program,
  poolPubkey: PublicKey,
  circuitId: number[],
  vkData: VerificationKeyData,
  authority: PublicKey,
): Promise<string> {
  const [vkPDA] = await findVkPDA(zkVerifierProgram, poolPubkey, circuitId);

  console.log(`  🔐 VK PDA: ${vkPDA.toBase58()}`);
  console.log(`  👤 Authority: ${authority.toBase58()}`);

  // Convert to format expected by Anchor
  const tx = await zkVerifierProgram.methods
    .storeVk(circuitId, {
      alphaG1: vkData.alpha_g1,
      betaG2: vkData.beta_g2,
      gammaG2: vkData.gamma_g2,
      deltaG2: vkData.delta_g2,
      ic: vkData.ic,
    })
    .accounts({
      authority,
      pool: poolPubkey,
      verificationKey: vkPDA,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

/**
 * Generate VKs for all circuits
 */
async function generateAllVKs(): Promise<Map<string, ParsedVK>> {
  console.log("\n🔧 GENERATING VERIFICATION KEYS");
  console.log("═".repeat(70));

  const circuits = [
    { name: "deposit", id: CIRCUIT_IDS.DEPOSIT },
    { name: "withdraw", id: CIRCUIT_IDS.WITHDRAW },
    { name: "transfer", id: CIRCUIT_IDS.TRANSFER },
  ];

  const vks = new Map<string, ParsedVK>();

  for (const circuit of circuits) {
    console.log(`\n📦 Processing ${circuit.name.toUpperCase()} circuit`);
    console.log("─".repeat(70));

    const artifact = await loadCircuit(circuit.name);

    if (!artifact) {
      console.error(`  ⚠️  Skipping - artifact not found`);
      continue;
    }

    try {
      const vk = await generateVK(artifact, circuit.name);
      vks.set(circuit.name, vk);

      saveVK(circuit.name, vk);

      console.log(`  ✅ ${circuit.name} VK generated successfully`);
    } catch (error) {
      console.error(`  ❌ Failed to generate VK:`, error);
    }
  }

  return vks;
}

/**
 * Deploy pre-generated VKs to Solana
 */
async function deployVKs(vks?: Map<string, ParsedVK>): Promise<void> {
  console.log("\n🚀 DEPLOYING VERIFICATION KEYS TO SOLANA");
  console.log("═".repeat(70));

  // Configure provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log(`📡 Cluster: ${provider.connection.rpcEndpoint}`);
  console.log(`🔑 Wallet: ${provider.wallet.publicKey.toBase58()}\n`);

  // Load programs
  const shieldedPoolProgram = anchor.workspace.ShieldedPool;
  const zkVerifierProgram = anchor.workspace.ZkVerifier;

  if (!shieldedPoolProgram || !zkVerifierProgram) {
    throw new Error("Failed to load programs. Make sure they are built and deployed.");
  }

  console.log(`✅ Shielded Pool: ${shieldedPoolProgram.programId.toBase58()}`);
  console.log(`✅ ZK Verifier: ${zkVerifierProgram.programId.toBase58()}\n`);

  // Find pool PDA
  const [poolPDA] = await findPoolPDA(shieldedPoolProgram);
  console.log(`🏊 Pool PDA: ${poolPDA.toBase58()}\n`);

  const circuits = [
    { name: "deposit", id: CIRCUIT_IDS.DEPOSIT },
    { name: "withdraw", id: CIRCUIT_IDS.WITHDRAW },
    { name: "transfer", id: CIRCUIT_IDS.TRANSFER },
  ];

  for (const circuit of circuits) {
    console.log(`\n📤 Deploying ${circuit.name.toUpperCase()} VK`);
    console.log("─".repeat(70));

    let vkData: VerificationKeyData;

    // Load from Map or file
    if (vks && vks.has(circuit.name)) {
      vkData = vks.get(circuit.name)!.data;
      console.log(`  📦 Using generated VK`);
    } else {
      const vkPath = path.join(VK_OUTPUT_DIR, `${circuit.name}.vk.json`);
      if (!fs.existsSync(vkPath)) {
        console.error(`  ❌ VK file not found: ${vkPath}`);
        continue;
      }
      const loaded = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
      vkData = {
        alpha_g1: loaded.alpha_g1,
        beta_g2: loaded.beta_g2,
        gamma_g2: loaded.gamma_g2,
        delta_g2: loaded.delta_g2,
        ic: loaded.ic,
      };
      console.log(`  📁 Loaded from file: ${vkPath}`);
    }

    try {
      const tx = await storeVk(
        zkVerifierProgram,
        poolPDA,
        Array.from(circuit.id),
        vkData,
        provider.wallet.publicKey,
      );

      console.log(`  ✅ VK deployed successfully`);
      console.log(`  📝 Transaction: ${tx}`);

      // Verify deployment
      const [vkPDA] = await findVkPDA(zkVerifierProgram, poolPDA, Array.from(circuit.id));
      const vkAccount = await zkVerifierProgram.account.verificationKey.fetch(vkPDA);
      console.log(`  ✓ Verified on-chain: ${vkAccount.icLength} IC points`);
    } catch (error: any) {
      if (error.message?.includes("already in use")) {
        console.warn(`  ⚠️  VK already deployed (account exists)`);
        console.log(`  💡 Use update-vks.ts script to update existing VKs`);
      } else {
        console.error(`  ❌ Failed to deploy VK:`, error.message || error);
      }
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const skipDeploy = args.includes("--skip-deploy");
  const deployOnly = args.includes("--deploy-only");

  console.log("\n");
  console.log("═".repeat(70));
  console.log("    NOIRWIRE VERIFICATION KEY GENERATION & DEPLOYMENT");
  console.log("═".repeat(70));
  console.log("🔐 TREE_DEPTH: 24 (Production - 16M capacity)");
  console.log("🌳 Circuits: deposit, withdraw, transfer");
  console.log("═".repeat(70));

  try {
    if (deployOnly) {
      console.log("\n📋 Mode: Deploy pre-generated VKs only");
      await deployVKs();
    } else {
      console.log("\n📋 Mode: Generate and Deploy");
      const vks = await generateAllVKs();

      if (!skipDeploy && vks.size > 0) {
        await deployVKs(vks);
      } else if (skipDeploy) {
        console.log("\n⏭️  Skipping deployment (--skip-deploy flag)");
      }
    }

    console.log("\n");
    console.log("═".repeat(70));
    console.log("✅ VERIFICATION KEY PROCESS COMPLETE");
    console.log("═".repeat(70));
    console.log("");
  } catch (error) {
    console.error("\n❌ ERROR:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
