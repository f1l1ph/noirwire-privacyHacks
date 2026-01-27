#!/usr/bin/env node
/**
 * Quick test to verify the field modulus fix is working
 */

const sdk = require('./packages/sdk/dist/index.js');

console.log('🧪 Testing Field Modulus Fix\n');
console.log('='.repeat(60));

// Test 1: Check constant exists
console.log('\n✓ Test 1: Field modulus constant');
if (sdk.BN254_FIELD_MODULUS) {
  console.log('  ✅ BN254_FIELD_MODULUS exists');
  console.log(`  Value: 0x${sdk.BN254_FIELD_MODULUS.toString(16)}`);
} else {
  console.log('  ❌ BN254_FIELD_MODULUS NOT FOUND');
  console.log('  ⚠️  SDK not rebuilt with fix!');
  process.exit(1);
}

// Test 2: Generate blinding factors
console.log('\n✓ Test 2: Generate 100 blinding factors');
let invalidCount = 0;
for (let i = 0; i < 100; i++) {
  const blinding = sdk.generateBlinding();
  if (blinding >= sdk.BN254_FIELD_MODULUS) {
    invalidCount++;
    console.log(`  ❌ Blinding ${i} exceeds field modulus!`);
  }
}
if (invalidCount === 0) {
  console.log('  ✅ All 100 blinding factors are valid');
} else {
  console.log(`  ❌ ${invalidCount}/100 blinding factors are INVALID`);
  process.exit(1);
}

// Test 3: Generate nullifier secrets
console.log('\n✓ Test 3: Generate 100 nullifier secrets');
invalidCount = 0;
for (let i = 0; i < 100; i++) {
  const secret = sdk.generateNullifierSecret();
  if (secret >= sdk.BN254_FIELD_MODULUS) {
    invalidCount++;
    console.log(`  ❌ Nullifier secret ${i} exceeds field modulus!`);
  }
}
if (invalidCount === 0) {
  console.log('  ✅ All 100 nullifier secrets are valid');
} else {
  console.log(`  ❌ ${invalidCount}/100 nullifier secrets are INVALID`);
  process.exit(1);
}

// Test 4: Test bytes conversion with large value
console.log('\n✓ Test 4: Test bytes32ToBigint with maximum value');
const maxBytes = new Uint8Array(32);
maxBytes.fill(0xff); // All 1s = largest possible 256-bit value
const converted = sdk.bytes32ToBigint(maxBytes);

console.log(`  Input (max):  0x${'ff'.repeat(32)}`);
console.log(`  Output:       0x${converted.toString(16)}`);
console.log(`  Field mod:    0x${sdk.BN254_FIELD_MODULUS.toString(16)}`);

if (converted < sdk.BN254_FIELD_MODULUS) {
  console.log('  ✅ Large value correctly reduced');
} else {
  console.log('  ❌ Large value NOT reduced');
  process.exit(1);
}

// Test 5: Verify the problematic value from your error
console.log('\n✓ Test 5: Check your error value');
const yourErrorValue = 0x6ce80cfcd3b6303c94f21f7bf76abb02a873bb87a49308274b7c81c7ba15e1ban;
const fieldMod = sdk.BN254_FIELD_MODULUS;

console.log(`  Your value:   0x${yourErrorValue.toString(16)}`);
console.log(`  Field mod:    0x${fieldMod.toString(16)}`);
console.log(`  Comparison:   ${yourErrorValue > fieldMod ? 'TOO LARGE ❌' : 'Valid ✅'}`);

if (yourErrorValue >= fieldMod) {
  console.log('  ⚠️  This value WOULD cause an error');
  console.log('  ✅ But with the fix, it would be reduced to:');
  console.log(`     0x${(yourErrorValue % fieldMod).toString(16)}`);
} else {
  console.log('  ✅ This value is actually valid (weird!)');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Summary\n');
console.log('✅ Field modulus constant: EXISTS');
console.log('✅ Blinding generation: VALID (100/100)');
console.log('✅ Nullifier generation: VALID (100/100)');
console.log('✅ Bytes conversion: REDUCES CORRECTLY');
console.log('\n🎉 All tests passed! The fix is working.\n');
console.log('='.repeat(60));
console.log('\nNext steps:');
console.log('1. Clear browser localStorage (or use incognito)');
console.log('2. Clear apps/web/.next cache');
console.log('3. Restart web app: cd apps/web && yarn dev');
console.log('4. Test deposit again\n');
