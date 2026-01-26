#![allow(ambiguous_glob_reexports)]

pub mod cleanup_nullifier;
pub mod deposit;
pub mod emergency_withdraw;
pub mod init_historical_roots;
pub mod initialize;
pub mod record_nullifier;
pub mod set_paused;
pub mod settle_batch;
pub mod withdraw;

// Re-export everything from each instruction module
// This is required for Anchor's #[program] macro to work correctly
// Note: The handler functions have the same name, but the lib.rs calls them
// qualified as instructions::module::handler() to avoid ambiguity
pub use cleanup_nullifier::*;
pub use deposit::*;
pub use emergency_withdraw::*;
pub use init_historical_roots::*;
pub use initialize::*;
pub use record_nullifier::*;
pub use set_paused::*;
pub use settle_batch::*;
pub use withdraw::*;
