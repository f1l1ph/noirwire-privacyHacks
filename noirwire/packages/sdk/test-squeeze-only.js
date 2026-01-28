// Test: only permute at squeeze time
import { Barretenberg } from "@aztec/bb.js";

async function main() {
  const bb = await Barretenberg.new();

  const length = 3;
  const iv = BigInt(length) << 64n;

  // Initialize: state = [0, 0, 0, IV]
  let state = [0n, 0n, 0n, iv];

  // Cache inputs [1, 2, 3] WITHOUT permuting yet
  const cache = [1n, 2n, 3n];

  console.log(
    "Initial state:",
    state.map((s) => "0x" + s.toString(16)),
  );
  console.log("Cache:", cache);

  // Squeeze: perform duplex (add cache to state,then permute)
  for (let i = 0; i < 3; i++) {
    state[i] += cache[i];
  }

  console.log(
    "After adding cache:",
    state.map((s) => "0x" + s.toString(16)),
  );

  // ONE permutation
  let buffers = state.map((s) => Buffer.from(s.toString(16).padStart(64, "0"), "hex"));
  let permuted = await bb.poseidon2Permutation(buffers);
  state = permuted.map((buf) => BigInt("0x" + Buffer.from(buf.value).toString("hex")));

  console.log("After permutation:    0x" + state[0].toString(16));
  console.log(
    "Expected from Noir:   0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8",
  );
}

main().catch(console.error);
