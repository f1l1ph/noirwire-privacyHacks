/**
 * Test to explore bb.js Poseidon2 API
 */

async function exploreBBAPI() {
  console.log("Loading @aztec/bb.js...");
  const bbModule = await import("@aztec/bb.js");
  console.log("Available exports:", Object.keys(bbModule));

  const bb = await bbModule.Barretenberg.new();
  console.log("\nBarretenberg instance methods:");
  console.log(
    Object.getOwnPropertyNames(Object.getPrototypeOf(bb)).filter(
      (m) => m.includes("poseidon") || m.includes("Poseidon"),
    ),
  );

  // Test the hash
  const inputs = [1n, 2n, 3n].map((i) => {
    const hex = i.toString(16).padStart(64, "0");
    return Buffer.from(hex, "hex");
  });

  console.log("\nTesting poseidon2Hash:");
  const hash = await bb.poseidon2Hash(inputs);
  console.log("Result type:", typeof hash);
  console.log("Result:", hash);

  // Check for sponge or other methods
  if (bb.poseidon2HashWithSeparator) {
    console.log("\n✅ poseidon2HashWithSeparator exists!");
  }
  if (bb.poseidon2Permutation) {
    console.log("✅ poseidon2Permutation exists!");
  }
}

exploreBBAPI().catch(console.error);
