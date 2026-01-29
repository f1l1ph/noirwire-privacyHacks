/**
 * Fix VKs Generated with Public Input Bug
 *
 * This script corrects VKs that were generated with the wrong public input count.
 * It reads the actual public input count from circuit ABIs and trims the VKs accordingly.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CIRCUITS_PATH = path.join(__dirname, "../../noir-circuits/target");
const VK_INPUT_DIR = path.join(__dirname, "../vks");
const VK_OUTPUT_DIR = path.join(__dirname, "../vks-fixed");

interface CircuitAbi {
  parameters: Array<{ name: string; type: any; visibility: string }>;
}

interface VKData {
  circuit: string;
  numPublicInputs: number;
  timestamp: string;
  treeDepth: number;
  alpha_g1: number[];
  beta_g2: number[];
  gamma_g2: number[];
  delta_g2: number[];
  ic: number[][];
}

/**
 * Count actual public inputs from circuit ABI
 */
function countPublicInputs(circuitName: string): number {
  const circuitPath = path.join(CIRCUITS_PATH, `${circuitName}.json`);
  const circuit = JSON.parse(fs.readFileSync(circuitPath, "utf-8"));
  const abi = circuit.abi as CircuitAbi;

  // Count parameters with visibility === "public"
  return abi.parameters.filter(p => p.visibility === "public").length;
}

/**
 * Fix VK by correcting public input count and trimming IC points
 */
function fixVK(circuitName: string): void {
  console.log(`\n📦 Processing ${circuitName.toUpperCase()}`);
  console.log("─".repeat(70));

  // Read buggy VK
  const vkPath = path.join(VK_INPUT_DIR, `${circuitName}.vk.json`);
  if (!fs.existsSync(vkPath)) {
    console.error(`  ❌ VK not found: ${vkPath}`);
    return;
  }

  const vk: VKData = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
  console.log(`  📊 Original VK: ${vk.numPublicInputs} public inputs, ${vk.ic.length} IC points`);

  // Get correct public input count from circuit ABI
  const correctCount = countPublicInputs(circuitName);
  console.log(`  ✅ Correct count from ABI: ${correctCount} public inputs`);

  // Fix the VK
  const fixedVK: VKData = {
    ...vk,
    numPublicInputs: correctCount,
    // IC points should be correctCount + 1 (one extra for the constant term)
    ic: vk.ic.slice(0, correctCount + 1),
    timestamp: new Date().toISOString(),
  };

  console.log(`  🔧 Fixed VK: ${fixedVK.numPublicInputs} public inputs, ${fixedVK.ic.length} IC points`);

  // Validate IC array matches expected size
  if (fixedVK.ic.length !== correctCount + 1) {
    console.error(`  ⚠️  Warning: IC length (${fixedVK.ic.length}) != expected (${correctCount + 1})`);
  }

  // Calculate size reduction
  const originalSize = JSON.stringify(vk).length;
  const fixedSize = JSON.stringify(fixedVK).length;
  const reduction = ((1 - fixedSize / originalSize) * 100).toFixed(1);

  console.log(`  💾 Size: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(fixedSize / 1024).toFixed(1)}KB (${reduction}% reduction)`);

  // Save fixed VK
  if (!fs.existsSync(VK_OUTPUT_DIR)) {
    fs.mkdirSync(VK_OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(VK_OUTPUT_DIR, `${circuitName}.vk.json`);
  fs.writeFileSync(outputPath, JSON.stringify(fixedVK, null, 2));
  console.log(`  ✅ Saved fixed VK to: ${outputPath}`);
}

/**
 * Main execution
 */
async function main() {
  console.log("\n");
  console.log("═".repeat(70));
  console.log("    NOIRWIRE VK FIX - Correct Public Input Counts");
  console.log("═".repeat(70));
  console.log("");

  const circuits = ["deposit", "withdraw", "transfer"];

  for (const circuit of circuits) {
    try {
      fixVK(circuit);
    } catch (error) {
      console.error(`  ❌ Error fixing ${circuit}:`, error);
    }
  }

  console.log("\n");
  console.log("═".repeat(70));
  console.log("✅ VK FIX COMPLETE");
  console.log("═".repeat(70));
  console.log("");
  console.log("📍 Fixed VKs saved to: vks-fixed/");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Review fixed VKs in vks-fixed/");
  console.log("  2. Copy to vks/ directory: cp vks-fixed/*.json vks/");
  console.log("  3. Deploy to devnet: yarn generate-and-deploy-vks --deploy-only");
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
