use super::pool_state::MAX_ROOT_AGE_SLOTS;
use anchor_lang::prelude::*;

/// Production Historical Roots PDA
///
/// This separate account stores a ring buffer of 900 historical merkle roots,
/// providing extended root validation beyond the pool's inline buffer.
///
/// DESIGN:
/// - Inline buffer (PoolState): 16 roots for quick lookups
/// - Extended buffer (HistoricalRoots PDA): 900 roots (~360 seconds = 6 minutes at 0.4s slots)
/// - Combined: Total 916 roots of buffer capacity
/// - Uses zero-copy deserialization for performance
///
/// STORAGE:
/// - 8 (discriminator) + 1 (version) + 3 (padding) + 2 (roots_index) + 2 (padding)
/// - + 32 (pool pubkey) + 900 * 32 (roots) + 900 * 8 (slots)
/// - Total: ~31,288 bytes
///
/// CRITICAL-03 FIX: Increased capacity to 900 slots for 6-minute window
/// At 0.4s per slot: 900 * 0.4 = 360 seconds = 6 minutes
///
/// See: Blueprint 11_Vault_Program.md, Security Audit CRITICAL-03, HIGH-01
pub const HISTORICAL_ROOTS_CAPACITY: usize = 900;

/// Seeds for deriving the Historical Roots PDA
pub const HISTORICAL_ROOTS_SEED: &[u8] = b"historical_roots";

/// Current version for HistoricalRoots account
/// SECURITY (LOW-03): Versioning for future-proof upgrades
pub const HISTORICAL_ROOTS_VERSION: u8 = 2;

/// Account for historical roots buffer
/// DESIGN: Uses borsh serialization (not zero_copy) to support 900 roots (larger than bytemuck limit)
/// Large arrays (> 256) cannot use zero_copy with bytemuck, so we use regular borsh encoding
/// Performance impact is minimal since reads are infrequent relative to writes
#[account]
#[derive(Default)]
pub struct HistoricalRoots {
    /// Account structure version
    /// SECURITY (LOW-03): Versioning for future-proof upgrades
    pub version: u8,

    /// Current index in the ring buffer (0-899)
    pub roots_index: u16,

    /// The pool this historical roots account belongs to
    pub pool: Pubkey,

    /// Ring buffer of historical merkle roots
    /// Size: 900 roots × 32 bytes = 28,800 bytes
    pub roots: Vec<[u8; 32]>,

    /// Ring buffer of slots when each root was added
    /// SECURITY (HIGH-01): Used for root expiration enforcement
    /// Size: 900 slots × 8 bytes = 7,200 bytes
    pub slots: Vec<u64>,
}

impl HistoricalRoots {
    /// Calculate maximum space needed for the account
    /// Layout: 8 (discriminator) + 1 (version) + 2 (roots_index)
    ///         + 32 (pool pubkey) + 4 (vec len) + 900*32 (roots) + 4 (vec len) + 900*8 (slots)
    /// ~= 36KB (accounting for borsh overhead and vector lengths)
    pub const MAX_SPACE: usize = 40000;

    /// Initialize with empty vectors
    pub fn init(&mut self, pool: Pubkey) {
        self.version = HISTORICAL_ROOTS_VERSION;
        self.roots_index = 0;
        self.pool = pool;
        self.roots = vec![[0u8; 32]; HISTORICAL_ROOTS_CAPACITY];
        self.slots = vec![0u64; HISTORICAL_ROOTS_CAPACITY];
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

    fn create_test_roots() -> HistoricalRoots {
        HistoricalRoots {
            version: HISTORICAL_ROOTS_VERSION,
            roots_index: 0,
            pool: Pubkey::default(),
            roots: vec![[0u8; 32]; HISTORICAL_ROOTS_CAPACITY],
            slots: vec![0u64; HISTORICAL_ROOTS_CAPACITY],
        }
    }

    #[test]
    fn test_ring_buffer_push() {
        let mut roots = create_test_roots();

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
        let mut roots = create_test_roots();

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
        let mut roots = create_test_roots();
        roots.roots_index = (HISTORICAL_ROOTS_CAPACITY - 1) as u16;

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
        const _: () = assert!(HistoricalRoots::MAX_SPACE < 10 * 1024 * 1024);
        // Verify max space is reasonable for 900 roots
        const _: () = assert!(HistoricalRoots::MAX_SPACE >= 40000);
    }
}
