// Hash helper for 3 inputs (nullifiers, etc.)
use std::hash::poseidon2::Poseidon2;

fn main(inputs: [Field; 3]) -> pub Field {
    Poseidon2::hash(inputs, 3)
}
