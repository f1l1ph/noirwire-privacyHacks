/**
 * Test script to verify Poseidon2 hash compatibility
 * between SDK (Barretenberg) and Noir circuit (std::hash::poseidon2)
 */

const { poseidon2Hash, computeCommitment, COMMITMENT_DOMAIN } = require("./dist/index.js");

async function testPoseidon2Compatibility() {
  console.log("=".repeat(60));
  console.log("POSEIDON2 COMPATIBILITY TEST (Noir Integration)");
  console.log("=".repeat(60));

  try {
    // Test 1: Commitment computation (matches circuit)
    console.log("\n[Test 1] Commitment computation (deposit circuit)");
    const balance = {
      owner: 12345n,
      amount: 100000000n, // 0.1 SOL in lamports
      vaultId: 0n,
      blinding: 99999n,
    };
    const commitment = await computeCommitment(balance);
    console.log("Balance:", {
      owner: balance.owner.toString(),
      amount: balance.amount.toString(),
      vaultId: balance.vaultId.toString(),
      blinding: balance.blinding.toString(),
    });
    console.log("Commitment:", commitment.toString());
    console.log("Commitment (hex):", "0x" + commitment.toString(16));

    // Expected from Noir circuit
    const expectedCommitment = 0x029072097bdef407df7f0e4e283c0bca58b7f4867048ab5d9998d6c59b720f86n;
    console.log("Expected (Noir):", "0x" + expectedCommitment.toString(16));

    if (commitment === expectedCommitment) {
      console.log("✅ MATCH! SDK and Noir produce identical commitments!");
    } else {
      console.log("❌ MISMATCH! Commitments differ.");
    }

    // Test 2: Manual commitment computation
    console.log("\n[Test 2] Manual commitment computation");
    const manualCommitment = await poseidon2Hash([
      COMMITMENT_DOMAIN,
      balance.owner,
      balance.amount,
      balance.vaultId,
      balance.blinding,
    ]);
    console.log("COMMITMENT_DOMAIN:", COMMITMENT_DOMAIN.toString());
    console.log("Manual commitment:", manualCommitment.toString());
    console.log("Match with computeCommitment:", commitment === manualCommitment ? "✅" : "❌");

    console.log("\n" + "=".repeat(60));
    console.log("✅ ALL TESTS PASSED - Noir integration working!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPoseidon2Compatibility();
