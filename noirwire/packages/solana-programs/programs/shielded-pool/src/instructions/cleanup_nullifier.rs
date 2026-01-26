use crate::errors::PoolError;
use crate::events::NullifierCleanupEvent;
use crate::state::*;
use anchor_lang::prelude::*;

/// Minimum age before a nullifier can be cleaned up (in slots)
///
/// SECURITY (LOW-02): Nullifier cleanup strategy
/// - ~2 hours at 0.4s per slot = 18000 slots
/// - Must be significantly longer than MAX_ROOT_AGE_SLOTS (900)
/// - Ensures nullifiers cannot be reused even if someone holds old proofs
pub const MIN_NULLIFIER_AGE_FOR_CLEANUP: u64 = 18000;

/// Cleanup Nullifier Context
///
/// SECURITY (LOW-02): Nullifier cleanup strategy
/// This instruction allows cleaning up old nullifier PDAs to recover rent.
///
/// SAFETY GUARANTEES:
/// - Only nullifiers older than MIN_NULLIFIER_AGE_FOR_CLEANUP can be cleaned
/// - Rent is returned to the pool authority (not arbitrary accounts)
/// - Event is emitted for audit trail
///
/// CONSIDERATIONS:
/// - Cleaned nullifiers could theoretically be reused if someone has very old proofs
/// - However, root expiration (HIGH-01) prevents this since proofs using expired roots fail
/// - MIN_NULLIFIER_AGE_FOR_CLEANUP >> MAX_ROOT_AGE_SLOTS provides defense in depth
#[derive(Accounts)]
pub struct CleanupNullifier<'info> {
    /// Pool state
    #[account(
        seeds = [b"pool", pool.token_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,

    /// Nullifier entry to clean up
    #[account(
        mut,
        seeds = [b"nullifier", pool.key().as_ref(), &nullifier_entry.nullifier],
        bump = nullifier_entry.bump,
        close = rent_recipient
    )]
    pub nullifier_entry: Account<'info, NullifierEntry>,

    /// Account to receive rent refund (pool authority)
    /// CHECK: Verified to be the pool authority
    #[account(
        mut,
        constraint = rent_recipient.key() == pool.authority @ PoolError::Unauthorized
    )]
    pub rent_recipient: AccountInfo<'info>,

    /// Anyone can call cleanup, but rent goes to authority
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Cleanup old nullifier PDA and recover rent
///
/// SECURITY (LOW-02): Nullifier cleanup
/// - Only cleans nullifiers older than MIN_NULLIFIER_AGE_FOR_CLEANUP
/// - Works in conjunction with root expiration (HIGH-01) for safety
pub fn handler(ctx: Context<CleanupNullifier>) -> Result<()> {
    let nullifier_entry = &ctx.accounts.nullifier_entry;
    let current_slot = Clock::get()?.slot;

    // Calculate nullifier age
    let nullifier_age = current_slot.saturating_sub(nullifier_entry.slot);

    // Verify nullifier is old enough to clean up
    require!(
        nullifier_age >= MIN_NULLIFIER_AGE_FOR_CLEANUP,
        PoolError::Unauthorized // Reuse error - nullifier too young
    );

    // Get rent that will be recovered (before close)
    let rent_recovered = ctx.accounts.nullifier_entry.to_account_info().lamports();

    // Emit cleanup event for audit trail
    emit!(NullifierCleanupEvent {
        pool: ctx.accounts.pool.key(),
        nullifier: nullifier_entry.nullifier,
        original_slot: nullifier_entry.slot,
        cleanup_slot: current_slot,
        rent_recovered,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Nullifier cleaned up: {:?}, age: {} slots, rent recovered: {}",
        nullifier_entry.nullifier,
        nullifier_age,
        rent_recovered
    );

    // Account closure handled by Anchor's `close` attribute
    Ok(())
}
