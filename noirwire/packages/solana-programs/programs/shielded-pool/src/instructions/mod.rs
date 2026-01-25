pub mod deposit;
pub mod init_historical_roots;
pub mod initialize;
pub mod record_nullifier;
pub mod set_paused;
pub mod settle_batch;
pub mod withdraw;

// Re-export everything from each instruction module
// This is required for Anchor's #[program] macro to work correctly
pub use deposit::*;
pub use init_historical_roots::*;
pub use initialize::*;
pub use record_nullifier::*;
pub use set_paused::*;
pub use settle_batch::*;
pub use withdraw::*;
