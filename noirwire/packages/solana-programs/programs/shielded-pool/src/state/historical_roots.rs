use anchor_lang::prelude::*;

/// Production Historical Roots PDA
///
/// This separate account stores a ring buffer of 900 historical merkle roots,
/// providing a ~6 minute spending window as specified in the blueprints.
///
/// DESIGN:
/// - 900 roots × 0.4s slot time = 360 seconds = 6 minutes
/// - Separate from PoolState to keep main account small
/// - Referenced by pool_state.historical_roots_pda
///
/// STORAGE:
/// - 8 (discriminator) + 32 (pool) + 2 (roots_index u16) + 900 * 32 (roots)
/// - Total: ~28,842 bytes (fits in Solana account limits of ~10MB)
///
/// See: Blueprint 11_Vault_Program.md, Security Audit CRITICAL-02
/// Number of historical roots to store (6 minute window at 0.4s slots)
pub const HISTORICAL_ROOTS_CAPACITY: usize = 900;

/// Seeds for deriving the Historical Roots PDA
pub const HISTORICAL_ROOTS_SEED: &[u8] = b"historical_roots";

#[account]
pub struct HistoricalRoots {
    /// The pool this historical roots account belongs to
    pub pool: Pubkey,

    /// Current index in the ring buffer (0-899)
    /// Using u16 to handle values up to 65535 (more than enough for 900)
    pub roots_index: u16,

    /// Ring buffer of historical merkle roots
    /// Size: 900 roots × 32 bytes = 28,800 bytes
    pub roots: [[u8; 32]; HISTORICAL_ROOTS_CAPACITY],
}

impl HistoricalRoots {
    /// Calculate space needed for the account (must be manually specified due to large array)
    pub const SPACE: usize = 8  // discriminator
        + 32                     // pool pubkey
        + 2                      // roots_index (u16)
        + (HISTORICAL_ROOTS_CAPACITY * 32); // roots array

    /// Initialize with all zeros
    pub fn init(&mut self, pool: Pubkey) {
        self.pool = pool;
        self.roots_index = 0;
        // roots array is already zeroed by Solana account initialization
    }

    /// Check if a root exists in the historical buffer
    pub fn contains(&self, root: &[u8; 32]) -> bool {
        // Zero roots are invalid (cleared slots)
        if *root == [0u8; 32] {
            return false;
        }
        self.roots.iter().any(|r| r == root)
    }

    /// Push a new root to the ring buffer
    ///
    /// SECURITY: Clears the next slot to prevent accepting very old roots after wraparound
    pub fn push(&mut self, root: [u8; 32]) {
        // Store root at current index
        self.roots[self.roots_index as usize] = root;

        // Advance index
        self.roots_index = ((self.roots_index as usize + 1) % HISTORICAL_ROOTS_CAPACITY) as u16;

        // Clear the next slot (prevents wraparound attacks)
        self.roots[self.roots_index as usize] = [0u8; 32];
    }

    /// Get the most recent N roots (for debugging/monitoring)
    pub fn recent_roots(&self, count: usize) -> Vec<[u8; 32]> {
        let count = count.min(HISTORICAL_ROOTS_CAPACITY);
        let mut result = Vec::with_capacity(count);

        for i in 0..count {
            let idx = if self.roots_index as usize > i {
                self.roots_index as usize - i - 1
            } else {
                HISTORICAL_ROOTS_CAPACITY - (i + 1 - self.roots_index as usize)
            };

            let root = self.roots[idx];
            if root != [0u8; 32] {
                result.push(root);
            }
        }

        result
    }
}

/// Helper function to derive HistoricalRoots PDA
pub fn find_historical_roots_pda(pool: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[HISTORICAL_ROOTS_SEED, pool.as_ref()], program_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_push() {
        let mut roots = HistoricalRoots {
            pool: Pubkey::default(),
            roots_index: 0,
            roots: [[0u8; 32]; HISTORICAL_ROOTS_CAPACITY],
        };

        // Push some roots
        let root1 = [1u8; 32];
        let root2 = [2u8; 32];

        roots.push(root1);
        assert!(roots.contains(&root1));
        assert_eq!(roots.roots_index, 1);

        roots.push(root2);
        assert!(roots.contains(&root1));
        assert!(roots.contains(&root2));
        assert_eq!(roots.roots_index, 2);
    }

    #[test]
    fn test_wraparound() {
        let mut roots = HistoricalRoots {
            pool: Pubkey::default(),
            roots_index: (HISTORICAL_ROOTS_CAPACITY - 1) as u16,
            roots: [[0u8; 32]; HISTORICAL_ROOTS_CAPACITY],
        };

        let root = [42u8; 32];
        roots.push(root);

        // Should wrap to 0
        assert_eq!(roots.roots_index, 0);
        assert!(roots.contains(&root));
    }

    #[test]
    fn test_space_calculation() {
        // Verify space is within Solana limits (max 10MB)
        // Using const assertion to satisfy clippy
        const _: () = assert!(HistoricalRoots::SPACE < 10 * 1024 * 1024);
        // Verify expected size
        assert_eq!(HistoricalRoots::SPACE, 8 + 32 + 2 + (900 * 32));
    }
}
