/**
 * Debug script to understand what each hash implementation produces
 */

async function debugHashes() {
  const barretenbergModule = await import("@aztec/bb.js");
  const bb = await barretenbergModule.Barretenberg.new();

  console.log("Testing different hash approaches:");
  console.log("==================================\n");

  // Test input
  const inputs = [1n, 2n, 3n];
  const buffers = inputs.map((i) => {
    const hex = i.toString(16).padStart(64, "0");
    return Buffer.from(hex, "hex");
  });

  // Test 1: Direct poseidon2Hash
  console.log("1. Direct bb.poseidon2Hash([1, 2, 3]):");
  const hash1 = await bb.poseidon2Hash(buffers);
  const hex1 = Buffer.from(hash1.value).toString("hex");
  console.log("   Result: 0x" + hex1);
  console.log("   BigInt: " + BigInt("0x" + hex1).toString());

  // Test 2: Try poseidon2Permutation with all zeros first
  console.log("\n2. poseidon2Permutation with state [1,2,3,0]:");
  const perm1 = await bb.poseidon2Permutation(
    buffers.concat([Buffer.from("00".repeat(32), "hex")]),
  );
  const permHex = perm1.map((buf) => Buffer.from(buf.value).toString("hex"));
  console.log("   State[0]:" + permHex[0]);
  console.log("   As BigInt: " + BigInt("0x" + permHex[0]).toString());

  // Test 3: Try with IV in state[3]
  console.log("\n3. poseidon2Permutation with IV state [0,0,0, 3<<64]:");
  const iv = BigInt(3) << 64n;
  const ivHex = iv.toString(16).padStart(64, "0");
  const buffers3 = [
    Buffer.from("00".repeat(32), "hex"),
    Buffer.from("00".repeat(32), "hex"),
    Buffer.from("00".repeat(32), "hex"),
    Buffer.from(ivHex, "hex"),
  ];
  // Now add inputs
  buffers3[0] = buffers[0];
  buffers3[1] = buffers[1];
  buffers3[2] = buffers[2];

  const perm3 = await bb.poseidon2Permutation(buffers3);
  const perm3Hex = perm3.map((buf) => Buffer.from(buf.value).toString("hex"));
  console.log("   State[0]: " + perm3Hex[0]);
  console.log("   As BigInt: " + BigInt("0x" + perm3Hex[0]).toString());
}

debugHashes().catch(console.error);
