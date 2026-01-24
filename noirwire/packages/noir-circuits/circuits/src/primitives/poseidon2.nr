// Lightweight stand-in for Poseidon2 hashing used in tests
// Deterministic but not cryptographically secure
pub struct Poseidon2;

impl Poseidon2 {
    pub fn hash<let N: u32>(inputs: [Field; N], arity: u32) -> Field {
        let mut acc = 0;
        for i in 0..N {
            // Simple mixing; sufficient for deterministic test fixtures
            acc = acc * 31 + inputs[i] * ((i + 1) as Field);
        }
        acc + (arity as Field)
    }
}
