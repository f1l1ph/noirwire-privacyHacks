// Test absorbing length first
import { Barretenberg } from "@aztec/bb.js";

async function main() {
  const bb = await Barretenberg.new();

  const length = 3;

  // Try absorbing length FIRST as a separate value
  // State: [0, 0, 0, 0]
  let state = [0n, 0n, 0n, 0n];

  // Add length to state[0]
  state[0] = BigInt(length);

  console.log(
    "State after adding length:",
    state.map((s) => "0x" + s.toString(16)),
  );

  // First permutation
  let buffers = state.map((s) => Buffer.from(s.toString(16).padStart(64, "0"), "hex"));
  let permuted = await bb.poseidon2Permutation(buffers);
  state = permuted.map((buf) => BigInt("0x" + Buffer.from(buf.value).toString("hex")));

  console.log("After permute (length):", "0x" + state[0].toString(16));

  // Now add inputs [1, 2, 3]
  state[0] += 1n;
  state[1] += 2n;
  state[2] += 3n;

  console.log(
    "State after adding inputs:",
    state.map((s) => "0x" + s.toString(16)),
  );

  // Second permutation
  buffers = state.map((s) => Buffer.from(s.toString(16).padStart(64, "0"), "hex"));
  permuted = await bb.poseidon2Permutation(buffers);
  state = permuted.map((buf) => BigInt("0x" + Buffer.from(buf.value).toString("hex")));

  console.log("After 2nd permutation:", "0x" + state[0].toString(16));
  console.log(
    "Expected from Noir:    0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8",
  );
}

main().catch(console.error);
