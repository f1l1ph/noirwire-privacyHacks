// Test with two permutations
import { Barretenberg } from "@aztec/bb.js";

async function main() {
  const bb = await Barretenberg.new();

  const length = 3;
  const iv = BigInt(length) << 64n;

  // Initial state: [0, 0, 0, IV]
  let state = [0n, 0n, 0n, iv];

  // Add inputs [1, 2, 3]
  state[0] += 1n;
  state[1] += 2n;
  state[2] += 3n;

  // First permutation
  let buffers = state.map((s) => Buffer.from(s.toString(16).padStart(64, "0"), "hex"));
  let permuted = await bb.poseidon2Permutation(buffers);
  state = permuted.map((buf) => BigInt("0x" + Buffer.from(buf.value).toString("hex")));

  console.log("After 1st permutation:", "0x" + state[0].toString(16));

  // Second permutation (squeeze?)
  buffers = state.map((s) => Buffer.from(s.toString(16).padStart(64, "0"), "hex"));
  permuted = await bb.poseidon2Permutation(buffers);
  state = permuted.map((buf) => BigInt("0x" + Buffer.from(buf.value).toString("hex")));

  console.log("After 2nd permutation:", "0x" + state[0].toString(16));
  console.log(
    "Expected from Noir:    0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8",
  );
}

main().catch(console.error);
