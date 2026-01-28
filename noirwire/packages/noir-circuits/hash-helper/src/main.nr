// Minimal circuit to expose Poseidon2 hash for SDK
// This ensures 100% compatibility between SDK and circuits
use std::hash::poseidon2::Poseidon2;

fn main(inputs: [Field; 5]) -> pub Field {
    // Hash 5 field elements (for commitment: domain, owner, amount, vault_id, blinding)
    Poseidon2::hash(inputs, 5)
}
