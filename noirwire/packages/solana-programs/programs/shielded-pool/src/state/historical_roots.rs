use super::pool_state::MAX_ROOT_AGE_SLOTS;
use anchor_lang::prelude::*;

/// Production Historical Roots PDA
///
/// This separate account stores a ring buffer of 256 historical merkle roots,
/// providing extended root validation beyond the pool's inline buffer.
///
/// DESIGN:
/// - Inline buffer (PoolState): 16 roots for quick lookups
/// - Extended buffer (HistoricalRoots PDA): 256 roots (~100 seconds at 0.4s slots)
/// - Combined: Total 272 roots of buffer capacity
/// - Uses zero-copy deserialization for performance
///
/// STORAGE:
/// - 8 (discriminator) + 1 (version) + 3 (padding) + 2 (roots_index) + 2 (padding)
/// - + 32 (pool pubkey) + 256 * 32 (roots) + 256 * 8 (slots)
/// - Total: ~10,288 bytes
///
/// NOTE: For full 6-minute (900-slot) window, client should track additional
/// roots off-chain or multiple HistoricalRoots PDAs can be chained.
///
/// See: Blueprint 11_Vault_Program.md, Security Audit CRITICAL-02, HIGH-01
pub const HISTORICAL_ROOTS_CAPACITY: usize = 256;

/// Seeds for deriving the Historical Roots PDA
pub const HISTORICAL_ROOTS_SEED: &[u8] = b"historical_roots";

/// Current version for HistoricalRoots account
/// SECURITY (LOW-03): Versioning for future-proof upgrades
pub const HISTORICAL_ROOTS_VERSION: u8 = 2;

/// Zero-copy account for historical roots buffer
/// IMPORTANT: Uses zero_copy to avoid BPF stack overflow
/// Capacity limited to 256 to satisfy bytemuck Pod/Zeroable array bounds
#[account(zero_copy)]
#[repr(C)]
pub struct HistoricalRoots {
    /// Account structure version
    /// SECURITY (LOW-03): Versioning for future-proof upgrades
    pub version: u8,

    /// Padding for alignment (zero_copy requires proper alignment)
    pub _padding1: [u8; 3],

    /// Current index in the ring buffer (0-255)
    pub roots_index: u16,

    /// Padding for alignment
    pub _padding2: [u8; 2],

    /// The pool this historical roots account belongs to
    pub pool: Pubkey,

    /// Ring buffer of historical merkle roots
    /// Size: 256 roots × 32 bytes = 8,192 bytes
    pub roots: [[u8; 32]; HISTORICAL_ROOTS_CAPACITY],

    /// Ring buffer of slots when each root was added
    /// SECURITY (HIGH-01): Used for root expiration enforcement
    /// Size: 256 slots × 8 bytes = 2,048 bytes
    pub slots: [u64; HISTORICAL_ROOTS_CAPACITY],
}

impl HistoricalRoots {
    /// Calculate space needed for the account (must be manually specified due to large array)
    /// Layout: 8 (discriminator) + 1 (version) + 3 (padding1) + 2 (roots_index) + 2 (padding2)
    ///         + 32 (pool pubkey) + 256*32 (roots) + 256*8 (slots)
    pub const SPACE: usize = 8   // discriminator
        + 1                      // version
        + 3                      // padding1
        + 2                      // roots_index (u16)
        + 2                      // padding2
        + 32                     // pool pubkey
        + (HISTORICAL_ROOTS_CAPACITY * 32)  // roots array (256 * 32 = 8192)
        + (HISTORICAL_ROOTS_CAPACITY * 8); // slots array (256 * 8 = 2048)

    /// Initialize with all zeros (for zero-copy accounts)
    pub fn init(&mut self, pool: Pubkey) {
        self.version = HISTORICAL_ROOTS_VERSION;
        self._padding1 = [0u8; 3];
        self.roots_index = 0;
        self._padding2 = [0u8; 2];
        self.pool = pool;
        // roots and slots arrays are already zeroed by Solana account initialization
    }

    /// Check if a root exists in the historical buffer (without expiration check)
    ///
    /// WARNING: Use `contains_with_expiration` for production code
    #[deprecated(
        note = "Use contains_with_expiration for production - this doesn't enforce expiration"
    )]
    pub fn contains(&self, root: &[u8; 32]) -> bool {
        // Zero roots are invalid (cleared slots)
        if *root == [0u8; 32] {
            return false;
        }
        self.roots.iter().any(|r| r == root)
    }

    /// Check if a root exists and is not expired
    ///
    /// SECURITY (HIGH-01): Root expiration enforcement
    /// - Checks if root exists in the buffer
    /// - Verifies root is not older than MAX_ROOT_AGE_SLOTS
    pub fn contains_with_expiration(&self, root: &[u8; 32], current_slot: u64) -> bool {
        // Zero roots are invalid (cleared slots)
        if *root == [0u8; 32] {
            return false;
        }

        for (i, hist_root) in self.roots.iter().enumerate() {
            if hist_root == root {
                let root_slot = self.slots[i];

                // Zero slot means uninitialized (invalid)
                if root_slot == 0 {
                    return false;
                }

                // Check expiration
                return current_slot.saturating_sub(root_slot) <= MAX_ROOT_AGE_SLOTS;
            }
        }

        false
    }

    /// Push a new root to the ring buffer with slot tracking
    ///
    /// SECURITY:
    /// - Clears the next slot to prevent accepting very old roots after wraparound
    /// - Tracks slot for expiration enforcement (HIGH-01)
    pub fn push(&mut self, root: [u8; 32], current_slot: u64) {
        // Store root and slot at current index
        self.roots[self.roots_index as usize] = root;
        self.slots[self.roots_index as usize] = current_slot;

        // Advance index
        self.roots_index = ((self.roots_index as usize + 1) % HISTORICAL_ROOTS_CAPACITY) as u16;

        // Clear the next slot (prevents wraparound attacks)
        self.roots[self.roots_index as usize] = [0u8; 32];
        self.slots[self.roots_index as usize] = 0;
    }

    /// Get the most recent N roots with their slots (for debugging/monitoring)
    pub fn recent_roots_with_slots(&self, count: usize) -> Vec<([u8; 32], u64)> {
        let count = count.min(HISTORICAL_ROOTS_CAPACITY);
        let mut result = Vec::with_capacity(count);

        for i in 0..count {
            let idx = if self.roots_index as usize > i {
                self.roots_index as usize - i - 1
            } else {
                HISTORICAL_ROOTS_CAPACITY - (i + 1 - self.roots_index as usize)
            };

            let root = self.roots[idx];
            let slot = self.slots[idx];
            if root != [0u8; 32] {
                result.push((root, slot));
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
            version: HISTORICAL_ROOTS_VERSION,
            _padding1: [0u8; 3],
            roots_index: 0,
            _padding2: [0u8; 2],
            pool: Pubkey::default(),
            roots: [[0u8; 32]; HISTORICAL_ROOTS_CAPACITY],
            slots: [0u64; HISTORICAL_ROOTS_CAPACITY],
        };

        // Push some roots with slot tracking
        let root1 = [1u8; 32];
        let root2 = [2u8; 32];
        let slot1 = 100u64;
        let slot2 = 200u64;

        roots.push(root1, slot1);
        assert!(roots.contains_with_expiration(&root1, slot1));
        assert_eq!(roots.roots_index, 1);

        roots.push(root2, slot2);
        assert!(roots.contains_with_expiration(&root1, slot2));
        assert!(roots.contains_with_expiration(&root2, slot2));
        assert_eq!(roots.roots_index, 2);
    }

    #[test]
    fn test_root_expiration() {
        let mut roots = HistoricalRoots {
            version: HISTORICAL_ROOTS_VERSION,
            _padding1: [0u8; 3],
            roots_index: 0,
            _padding2: [0u8; 2],
            pool: Pubkey::default(),
            roots: [[0u8; 32]; HISTORICAL_ROOTS_CAPACITY],
            slots: [0u64; HISTORICAL_ROOTS_CAPACITY],
        };

        let root = [1u8; 32];
        let initial_slot = 100u64;

        roots.push(root, initial_slot);

        // Root should be valid at current time
        assert!(roots.contains_with_expiration(&root, initial_slot + 100));

        // Root should still be valid just at expiration boundary
        assert!(roots.contains_with_expiration(&root, initial_slot + MAX_ROOT_AGE_SLOTS));

        // Root should be expired past the boundary
        assert!(!roots.contains_with_expiration(&root, initial_slot + MAX_ROOT_AGE_SLOTS + 1));
    }

    #[test]
    fn test_wraparound() {
        let mut roots = HistoricalRoots {
            version: HISTORICAL_ROOTS_VERSION,
            _padding1: [0u8; 3],
            roots_index: (HISTORICAL_ROOTS_CAPACITY - 1) as u16,
            _padding2: [0u8; 2],
            pool: Pubkey::default(),
            roots: [[0u8; 32]; HISTORICAL_ROOTS_CAPACITY],
            slots: [0u64; HISTORICAL_ROOTS_CAPACITY],
        };

        let root = [42u8; 32];
        let slot = 1000u64;
        roots.push(root, slot);

        // Should wrap to 0
        assert_eq!(roots.roots_index, 0);
        assert!(roots.contains_with_expiration(&root, slot + 10));
    }

    #[test]
    fn test_space_calculation() {
        // Verify space is within Solana limits (max 10MB)
        // Using const assertion to satisfy clippy
        const _: () = assert!(HistoricalRoots::SPACE < 10 * 1024 * 1024);
        // Verify expected size (updated with slots array and padding)
        // 8 (discriminator) + 1 (version) + 3 (padding1) + 2 (roots_index) + 2 (padding2)
        // + 32 (pool) + 256*32 (roots) + 256*8 (slots)
        assert_eq!(
            HistoricalRoots::SPACE,
            8 + 1 + 3 + 2 + 2 + 32 + (256 * 32) + (256 * 8)
        );
    }
}
