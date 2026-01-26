/**
 * Deploy Verification Keys to Solana
 *
 * This script:
 * 1. Loads compiled Noir circuit artifacts
 * 2. Generates verification keys using Barretenberg
 * 3. Stores the VKs on-chain via the zk-verifier program
 *
 * Usage:
 *   yarn ts-node scripts/deploy-vks.ts --network localnet
 *   yarn ts-node scripts/deploy-vks.ts --network devnet
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BarretenbergBackend } from "@noir-lang/backend_barretenberg";
import * as fs from "fs";
import * as path from "path";

// Circuit IDs from proof.rs (keccak256 hashes)
const CIRCUIT_IDS = {
  DEPOSIT: Buffer.from([
    0x04, 0x8b, 0xf3, 0x55, 0x3a, 0xfe, 0x34, 0x84, 0x85, 0x27, 0x8e, 0x5e, 0x56, 0x78, 0x39, 0x12,
    0x4a, 0x80, 0xf6, 0xa5, 0x71, 0xd2, 0xb7, 0xa6, 0x44, 0xd3, 0x23, 0xbf, 0x97, 0xb4, 0x76, 0x5a,
  ]),
  WITHDRAW: Buffer.from([
    0x07, 0x49, 0xf5, 0x64, 0xac, 0x73, 0x88, 0x92, 0x4c, 0x2c, 0xd3, 0x94, 0xd2, 0x08, 0x15, 0xe2,
    0x0e, 0xab, 0xa7, 0xf3, 0x5a, 0xf3, 0x31, 0xe3, 0x11, 0x07, 0x8d, 0x81, 0xbb, 0x78, 0xbc, 0x4e,
  ]),
  TRANSFER: Buffer.from([
    0xbc, 0x88, 0x93, 0xac, 0x50, 0xd8, 0x33, 0x91, 0x3c, 0x65, 0x5c, 0xaf, 0x91, 0xb7, 0x74, 0xfc,
    0x99, 0x5f, 0x70, 0x42, 0x45, 0x62, 0x2e, 0xc6, 0x3d, 0x9d, 0x04, 0x27, 0x55, 0x86, 0x3f, 0x7d,
  ]),
  BATCH_SETTLEMENT: Buffer.from([
    0x4b, 0x03, 0xaf, 0x69, 0x18, 0xb4, 0x24, 0x13, 0x67, 0xa6, 0x16, 0x86, 0x38, 0x22, 0x92, 0x6e,
    0x7b, 0x9b, 0xe3, 0x31, 0x89, 0xb1, 0xef, 0x8f, 0xca, 0x3a, 0x04, 0xbc, 0xd1, 0x8c, 0x23, 0x4f,
  ]),
};

// Path to compiled circuit artifacts
const CIRCUITS_PATH = path.join(__dirname, "../../noir-circuits/circuits/target");

interface CircuitArtifact {
  bytecode: string;
  abi: unknown;
}

interface VerificationKeyData {
  alpha_g1: number[];
  beta_g2: number[];
  gamma_g2: number[];
  delta_g2: number[];
  ic: number[][];
}

async function loadCircuit(name: string): Promise<CircuitArtifact | null> {
  const filePath = path.join(CIRCUITS_PATH, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`Circuit artifact not found: ${filePath}`);
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

async function generateVK(circuit: CircuitArtifact): Promise<VerificationKeyData> {
  const backend = new BarretenbergBackend(circuit as any);

  // Get the verification key
  const vkRaw = await backend.getVerificationKey();

  // Parse the VK into the format expected by Solana
  // The exact parsing depends on Barretenberg's output format
  // This is a simplified version - adjust based on actual VK structure

  // Verification key format from Barretenberg:
  // - alpha_g1: 64 bytes (G1 point uncompressed)
  // - beta_g2: 128 bytes (G2 point uncompressed)
  // - gamma_g2: 128 bytes (G2 point uncompressed)
  // - delta_g2: 128 bytes (G2 point uncompressed)
  // - ic: array of G1 points (64 bytes each)

  const vk = parseVerificationKey(vkRaw);

  await backend.destroy();

  return vk;
}

function parseVerificationKey(vkRaw: Uint8Array): VerificationKeyData {
  // This parsing depends on Barretenberg's VK format
  // Typical Groth16 VK structure:
  // - 4 bytes: num_public_inputs
  // - 64 bytes: alpha_g1
  // - 128 bytes: beta_g2
  // - 128 bytes: gamma_g2
  // - 128 bytes: delta_g2
  // - remaining: IC points (64 bytes each)

  let offset = 0;

  // Read number of public inputs (4 bytes, little-endian)
  const numPublicInputs = new DataView(vkRaw.buffer).getUint32(offset, true);
  offset += 4;

  // Read alpha_g1 (64 bytes)
  const alpha_g1 = Array.from(vkRaw.slice(offset, offset + 64));
  offset += 64;

  // Read beta_g2 (128 bytes)
  const beta_g2 = Array.from(vkRaw.slice(offset, offset + 128));
  offset += 128;

  // Read gamma_g2 (128 bytes)
  const gamma_g2 = Array.from(vkRaw.slice(offset, offset + 128));
  offset += 128;

  // Read delta_g2 (128 bytes)
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

  return {
    alpha_g1,
    beta_g2,
    gamma_g2,
    delta_g2,
    ic,
  };
}

async function findPoolPDA(program: Program): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
}

async function findVkPDA(
  zkVerifierProgram: Program,
  poolPubkey: PublicKey,
  circuitId: Buffer,
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("verification_key"), poolPubkey.toBuffer(), circuitId],
    zkVerifierProgram.programId,
  );
}

async function storeVk(
  zkVerifierProgram: Program,
  poolPubkey: PublicKey,
  circuitId: Buffer,
  vkData: VerificationKeyData,
  authority: PublicKey,
): Promise<string> {
  const [vkPDA] = await findVkPDA(zkVerifierProgram, poolPubkey, circuitId);

  // Calculate VK account size
  const vkSize = 8 + 32 + 32 + 64 + 128 + 128 + 128 + 1 + 4 + vkData.ic.length * 64 + 1;

  // Convert VK data to the format expected by the program
  const alpha_g1 = new Uint8Array(vkData.alpha_g1);
  const beta_g2 = new Uint8Array(vkData.beta_g2);
  const gamma_g2 = new Uint8Array(vkData.gamma_g2);
  const delta_g2 = new Uint8Array(vkData.delta_g2);
  const ic = vkData.ic.map((point) => Array.from(point));

  const tx = await zkVerifierProgram.methods
    .storeVk(Array.from(circuitId), {
      alpha_g1: Array.from(alpha_g1),
      beta_g2: Array.from(beta_g2),
      gamma_g2: Array.from(gamma_g2),
      delta_g2: Array.from(delta_g2),
      ic: ic,
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

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const networkArg = args.find((arg) => arg.startsWith("--network="));
  const network = networkArg ? networkArg.split("=")[1] : "localnet";

  console.log(`Deploying verification keys to ${network}...`);

  // Configure provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load programs
  const shieldedPoolProgram = anchor.workspace.ShieldedPool;
  const zkVerifierProgram = anchor.workspace.ZkVerifier;

  if (!shieldedPoolProgram || !zkVerifierProgram) {
    console.error("Failed to load programs. Make sure they are built and deployed.");
    process.exit(1);
  }

  // Find pool PDA
  const [poolPDA] = await findPoolPDA(shieldedPoolProgram);
  console.log(`Pool PDA: ${poolPDA.toBase58()}`);

  // Circuit names to deploy
  const circuits = [
    { name: "deposit", id: CIRCUIT_IDS.DEPOSIT },
    { name: "withdraw", id: CIRCUIT_IDS.WITHDRAW },
    { name: "transfer", id: CIRCUIT_IDS.TRANSFER },
    { name: "batch_settlement", id: CIRCUIT_IDS.BATCH_SETTLEMENT },
  ];

  for (const circuit of circuits) {
    console.log(`\nProcessing ${circuit.name} circuit...`);

    // Load circuit artifact
    const artifact = await loadCircuit(circuit.name);

    if (!artifact) {
      console.log(`  Skipping - artifact not found`);
      continue;
    }

    try {
      // Generate verification key
      console.log(`  Generating verification key...`);
      const vkData = await generateVK(artifact);

      // Store VK on-chain
      console.log(`  Storing VK on-chain...`);
      const tx = await storeVk(
        zkVerifierProgram,
        poolPDA,
        circuit.id,
        vkData,
        provider.wallet.publicKey,
      );

      console.log(`  ✅ VK stored successfully`);
      console.log(`  Transaction: ${tx}`);
    } catch (error) {
      console.error(`  ❌ Failed to deploy VK:`, error);
    }
  }

  console.log("\n✅ Verification key deployment complete!");
}

// Alternative: Deploy VKs from pre-generated files
async function deployFromFiles() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const zkVerifierProgram = anchor.workspace.ZkVerifier;
  const shieldedPoolProgram = anchor.workspace.ShieldedPool;

  const [poolPDA] = await findPoolPDA(shieldedPoolProgram);

  const vkDir = path.join(__dirname, "../vks");

  if (!fs.existsSync(vkDir)) {
    console.log("No pre-generated VK files found. Run `yarn generate-vks` first.");
    return;
  }

  const circuits = [
    { name: "deposit", id: CIRCUIT_IDS.DEPOSIT },
    { name: "withdraw", id: CIRCUIT_IDS.WITHDRAW },
    { name: "transfer", id: CIRCUIT_IDS.TRANSFER },
    { name: "batch_settlement", id: CIRCUIT_IDS.BATCH_SETTLEMENT },
  ];

  for (const circuit of circuits) {
    const vkPath = path.join(vkDir, `${circuit.name}.vk.json`);

    if (!fs.existsSync(vkPath)) {
      console.log(`VK file not found: ${vkPath}`);
      continue;
    }

    const vkData: VerificationKeyData = JSON.parse(fs.readFileSync(vkPath, "utf-8"));

    console.log(`Deploying ${circuit.name} VK...`);
    const tx = await storeVk(
      zkVerifierProgram,
      poolPDA,
      circuit.id,
      vkData,
      provider.wallet.publicKey,
    );

    console.log(`  ✅ Deployed: ${tx}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
