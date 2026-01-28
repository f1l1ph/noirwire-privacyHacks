// Test endianness
import { Barretenberg } from "@aztec/bb.js";

async function main() {
  const bb = await Barretenberg.new();

  const length = 3;
  const iv = BigInt(length) << 64n;

  let state = [0n, 0n, 0n, iv];
  state[0] += 1n;
  state[1] += 2n;
  state[2] += 3n;

  console.log("Testing different buffer encodings...\n");

  // Try BIG-endian (default - what we've been using)
  let buffers = state.map((s) => Buffer.from(s.toString(16).padStart(64, "0"), "hex"));
  let permuted = await bb.poseidon2Permutation(buffers);
  let result = permuted.map((buf) => BigInt("0x" + Buffer.from(buf.value).toString("hex")));
  console.log("BIG-endian:    0x" + result[0].toString(16));

  // Try LITTLE-endian
  buffers = state.map((s) => {
    const hex = s.toString(16).padStart(64, "0");
    const buf = Buffer.from(hex, "hex");
    return buf.reverse(); // Reverse to little-endian
  });
  permuted = await bb.poseidon2Permutation(buffers);
  result = permuted.map((buf) => {
    const reversed = Buffer.from(buf.value).reverse();
    return BigInt("0x" + reversed.toString("hex"));
  });
  console.log("LITTLE-endian: 0x" + result[0].toString(16));

  console.log("Expected:      0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8");
}

main().catch(console.error);
