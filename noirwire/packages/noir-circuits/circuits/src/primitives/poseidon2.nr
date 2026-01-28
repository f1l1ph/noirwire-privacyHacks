// Poseidon2 hash implementation for NoirWire
// Uses Noir's built-in std::hash::poseidon2 for compatibility with Barretenberg

use std::hash::poseidon2;

pub struct Poseidon2;

impl Poseidon2 {
    pub fn hash<let N: u32>(inputs: [Field; N], _arity: u32) -> Field {
        // Use Noir's standard library Poseidon2
        // This matches the Barretenberg implementation used by the SDK
        poseidon2::Poseidon2::hash(inputs, N)
    }
}
