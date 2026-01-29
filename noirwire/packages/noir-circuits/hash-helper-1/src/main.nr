// Hash helper for 1 input (single field hashing)
use std::hash::poseidon2::Poseidon2;

fn main(inputs: [Field; 1]) -> pub Field {
    Poseidon2::hash(inputs, 1)
}
