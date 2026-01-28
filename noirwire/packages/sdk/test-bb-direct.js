// Test Barretenberg direct hash
import { Barretenberg } from "@aztec/bb.js";

async function main() {
  const bb = await Barretenberg.new();

  const inputs = [1n, 2n, 3n];
  const buffers = inputs.map((n) => Buffer.from(n.toString(16).padStart(64, "0"), "hex"));

  const result = await bb.poseidon2Hash(buffers);
  const hash = BigInt("0x" + Buffer.from(result.value).toString("hex"));

  console.log("Direct bb.poseidon2Hash([1,2,3]):", "0x" + hash.toString(16));
  console.log(
    "Expected from Noir:                0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8",
  );
}

main().catch(console.error);
