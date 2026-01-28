// Test bare Poseidon2 permutation from Barretenberg
import { Barretenberg } from "@aztec/bb.js";

async function main() {
  const bb = await Barretenberg.new();

  // Test what Noir produces: inputs [1, 2, 3] → 0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8

  // Noir's sponge: state = [0, 0, 0, IV] where IV = length << 64
  const length = 3;
  const iv = BigInt(length) << 64n;

  console.log("IV:", iv.toString());
  console.log("IV (hex):", "0x" + iv.toString(16));

  // Initial state: [0, 0, 0, IV]
  let state = [0n, 0n, 0n, iv];

  console.log("\n=== Initial State ===");
  console.log(state.map((s) => "0x" + s.toString(16).padStart(64, "0")));

  // Add inputs [1, 2, 3] to first 3 positions
  state[0] += 1n;
  state[1] += 2n;
  state[2] += 3n;

  console.log("\n=== After adding inputs ===");
  console.log(state.map((s) => "0x" + s.toString(16).padStart(64, "0")));

  // Permute
  const buffers = state.map((s) => {
    const hex = s.toString(16).padStart(64, "0");
    return Buffer.from(hex, "hex");
  });

  const permuted = await bb.poseidon2Permutation(buffers);
  state = permuted.map((buf) => {
    const hex = Buffer.from(buf.value).toString("hex");
    return BigInt("0x" + hex);
  });

  console.log("\n=== After permutation ===");
  console.log(state.map((s) => "0x" + s.toString(16).padStart(64, "0")));

  console.log("\n=== Result (squeeze state[0]) ===");
  console.log("Result:", state[0].toString());
  console.log("Result (hex):", "0x" + state[0].toString(16));
  console.log(
    "\nExpected from Noir: 0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8",
  );
}

main().catch(console.error);
