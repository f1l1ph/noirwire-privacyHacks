// NoirWire ZK Circuits Library
// Main exports for all circuits

pub mod primitives;
pub mod core;
mod batch;
mod vault;
mod tests;

// Re-export primitives
pub use primitives::{commitment, merkle, nullifier, poseidon2};

// Re-export core circuits
pub use core::{deposit, transfer, withdraw};

// Re-export vault circuits
pub use vault::{membership, transfer as vault_transfer};

// Direct re-exports from merkle to ensure visibility
pub use primitives::merkle::{
    compute_intermediate_root, compute_merkle_root, MerkleProof, TREE_DEPTH, verify_batch_update,
    verify_merkle_inclusion, verify_merkle_update,
};

// Minimal smoke test to confirm nargo test discovery works at crate root
#[test]
fn smoke() {
    assert(1 == 1);
}
