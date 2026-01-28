// Hash helper for 2 inputs (merkle tree operations)
use std::hash::poseidon2::Poseidon2;

fn main(inputs: [Field; 2]) -> pub Field {
    Poseidon2::hash(inputs, 2)
}
