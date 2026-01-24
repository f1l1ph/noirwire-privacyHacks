// NoirWire ZK Circuits Library
// Main exports for all circuits

mod primitives;
mod core;
mod batch;
mod vault;

// Re-export primitives
use primitives::commitment;
use primitives::nullifier;
use primitives::merkle;

// Re-export core circuits
use core::deposit;
use core::transfer;
use core::withdraw;

// Re-export vault circuits
use vault::membership;
use vault::transfer as vault_transfer;
