# 11. Vault Program Blueprint

**Status:** 🟢 Complete Specification
**Version:** 1.0.0
**Last Updated:** 2026-01-22

---

## Table of Contents

1. [Overview](#1-overview)
2. [Vault Structure](#2-vault-structure)
3. [Permission System](#3-permission-system)
4. [Solana Vault Program](#4-solana-vault-program)
5. [User Flows](#5-user-flows)
6. [Security Model](#6-security-model)
7. [References](#7-references)

---

## 1. Overview

### The Simplified Model

**A solo user is just a vault of 1 member.** The vault system uses:

- **PER's Permission Program** for access control (NOT ZK membership proofs)
- **Unified balance structure** for solo and vault users
- **Simple vault structure**: `{ vault_id, admin, permission_group }`
- **Role-based permissions**: Viewer, Member, Admin

### Key Responsibilities

The vault program handles:

1. **Vault creation** - creates vault + permission group via CPI
2. **Member management** - add/remove members from permission group
3. **Deposit tagging** - creates Balance with vault_id
4. **Permission integration** - delegates access control to PER Permission Program

### What This System Does NOT Do

- ❌ Verify membership in ZK circuits (PER handles this)
- ❌ Store member merkle trees (no merkle trees at all)
- ❌ Enforce multi-sig thresholds on-chain (PER handles this)
- ❌ Manage member lists directly (stored in permission group)

---

## 2. Vault Structure

### 2.1 On-Chain Vault Account

```rust
/// Solana on-chain vault state
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Unique vault identifier
    pub vault_id: [u8; 32],

    /// Human-readable name (max 32 chars)
    #[max_len(32)]
    pub name: String,

    /// Admin who controls membership
    pub admin: Pubkey,

    /// PER Permission Group ID
    /// This is the group that controls access
    pub permission_group: [u8; 32],

    /// Unix timestamp
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}
```

**Design Decisions:**

- No `members_root` - membership managed by PER Permission Program, not merkle trees
- No `member_count` - stored in permission group
- No on-chain `threshold` - multi-sig managed by PER
- Simple `permission_group` reference delegates access control

### 2.2 Balance Structure (PER State)

```rust
/// Individual balance (solo user OR vault member)
pub struct Balance {
    /// Owner address
    pub owner: Pubkey,

    /// Token balance
    pub amount: u64,

    /// Optional: vault this balance belongs to
    /// None = solo user (private to self only)
    /// Some(vault_id) = vault member (visible to vault members)
    pub vault_id: Option<[u8; 32]>,
}
```

**Privacy model:**

- `vault_id: None` → Only owner can see balance
- `vault_id: Some(x)` → All members of vault `x` can see balance

---

## 3. Permission System

### 3.1 Permission Roles

From **Section 4** of Vault_research.md:

```rust
pub enum VaultRole {
    /// Can view all vault balances
    Viewer,

    /// Can view + transfer + withdraw own funds
    Member,

    /// Can view + transfer + withdraw + manage members
    Admin,
}
```

### 3.2 Permission Flow

```
Vault Program (L1)          PER Permission Program
      ↓                              ↓
create_vault()  ------CPI----→  create_permission_group()
add_member()    ------CPI----→  add_to_group(vault_id, member, role)
remove_member() ------CPI----→  remove_from_group(vault_id, member)
                                       ↓
                              PER checks permissions
                              before executing transfers
```

### 3.3 PER Permission Integration

When a user tries to access vault data in PER:

```rust
// In PER execution layer
fn get_vault_balances(user: Pubkey, vault_id: [u8; 32]) -> Result<Vec<Balance>> {
    // Check user has at least Viewer role
    let has_permission = permission_program.check_access(
        user,
        vault_id,
        MinRole::Viewer
    )?;

    if !has_permission {
        return Err("Not authorized");
    }

    // Return all balances with this vault_id
    Ok(balances.iter()
        .filter(|b| b.vault_id == Some(vault_id))
        .collect())
}
```

---

## 4. Solana Vault Program

### 4.1 Complete Program Implementation

File: `programs/vault/src/lib.rs`

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;

declare_id!("VAULT111111111111111111111111111111111111111");

#[program]
pub mod vault {
    use super::*;

    /// Create a new vault
    /// Calls PER Permission Program to create permission group
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: [u8; 32],
        name: String,
    ) -> Result<()> {
        require!(name.len() <= 32, VaultError::NameTooLong);

        let vault = &mut ctx.accounts.vault;
        vault.vault_id = vault_id;
        vault.name = name;
        vault.admin = ctx.accounts.admin.key();
        vault.created_at = Clock::get()?.unix_timestamp;
        vault.bump = ctx.bumps.vault;

        // CPI to PER Permission Program to create group
        let permission_group = invoke_per_create_group(
            ctx.accounts.per_permission_program.to_account_info(),
            vault_id,
            ctx.accounts.admin.key(),
        )?;

        vault.permission_group = permission_group;

        msg!("Vault created: {} with permission group: {}",
            hex::encode(vault_id),
            hex::encode(permission_group));

        Ok(())
    }

    /// Add a member to the vault
    /// Calls PER Permission Program to add to group
    pub fn add_vault_member(
        ctx: Context<ManageVault>,
        vault_id: [u8; 32],
        member: Pubkey,
        role: VaultRole,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        // CPI to PER Permission Program
        invoke_per_add_member(
            ctx.accounts.per_permission_program.to_account_info(),
            vault.permission_group,
            member,
            role,
        )?;

        msg!("Added member {} to vault {} with role {:?}",
            member,
            hex::encode(vault_id),
            role);

        Ok(())
    }

    /// Remove a member from the vault
    /// Calls PER Permission Program to remove from group
    pub fn remove_vault_member(
        ctx: Context<ManageVault>,
        vault_id: [u8; 32],
        member: Pubkey,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        // CPI to PER Permission Program
        invoke_per_remove_member(
            ctx.accounts.per_permission_program.to_account_info(),
            vault.permission_group,
            member,
        )?;

        msg!("Removed member {} from vault {}",
            member,
            hex::encode(vault_id));

        Ok(())
    }

    /// Deposit to vault (creates Balance with vault_id)
    /// This is called after user shields funds
    pub fn deposit_to_vault(
        ctx: Context<DepositToVault>,
        vault_id: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        // Verify user has Member role
        let has_permission = invoke_per_check_access(
            ctx.accounts.per_permission_program.to_account_info(),
            ctx.accounts.vault.permission_group,
            ctx.accounts.user.key(),
            VaultRole::Member,
        )?;

        require!(has_permission, VaultError::NotAuthorized);

        // CPI to pool program to create Balance with vault_id
        invoke_pool_deposit(
            ctx.accounts.pool_program.to_account_info(),
            ctx.accounts.user.key(),
            amount,
            Some(vault_id),  // Tag with vault_id
        )?;

        msg!("Deposited {} to vault {}",
            amount,
            hex::encode(vault_id));

        Ok(())
    }
}

// Accounts

#[derive(Accounts)]
#[instruction(vault_id: [u8; 32])]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", vault_id.as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: PER Permission Program
    pub per_permission_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageVault<'info> {
    #[account(
        mut,
        has_one = admin,
        seeds = [b"vault", vault.vault_id.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub admin: Signer<'info>,

    /// CHECK: PER Permission Program
    pub per_permission_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DepositToVault<'info> {
    #[account(
        seeds = [b"vault", vault.vault_id.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,

    pub user: Signer<'info>,

    /// CHECK: PER Permission Program
    pub per_permission_program: AccountInfo<'info>,

    /// CHECK: Pool Program
    pub pool_program: AccountInfo<'info>,
}

// State

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub vault_id: [u8; 32],

    #[max_len(32)]
    pub name: String,

    pub admin: Pubkey,
    pub permission_group: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}

// Enums

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum VaultRole {
    Viewer,
    Member,
    Admin,
}

// Errors

#[error_code]
pub enum VaultError {
    #[msg("Vault name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Not authorized to access this vault")]
    NotAuthorized,
}

// CPI Helpers

fn invoke_per_create_group(
    per_program: AccountInfo,
    vault_id: [u8; 32],
    admin: Pubkey,
) -> Result<[u8; 32]> {
    // Call PER Permission Program create_group instruction
    // Returns permission_group ID
    // Implementation depends on PER's actual API
    todo!("CPI to PER Permission Program")
}

fn invoke_per_add_member(
    per_program: AccountInfo,
    permission_group: [u8; 32],
    member: Pubkey,
    role: VaultRole,
) -> Result<()> {
    // Call PER Permission Program add_member instruction
    todo!("CPI to PER Permission Program")
}

fn invoke_per_remove_member(
    per_program: AccountInfo,
    permission_group: [u8; 32],
    member: Pubkey,
) -> Result<()> {
    // Call PER Permission Program remove_member instruction
    todo!("CPI to PER Permission Program")
}

fn invoke_per_check_access(
    per_program: AccountInfo,
    permission_group: [u8; 32],
    user: Pubkey,
    min_role: VaultRole,
) -> Result<bool> {
    // Call PER Permission Program check_access instruction
    todo!("CPI to PER Permission Program")
}

fn invoke_pool_deposit(
    pool_program: AccountInfo,
    user: Pubkey,
    amount: u64,
    vault_id: Option<[u8; 32]>,
) -> Result<()> {
    // Call Pool Program deposit instruction with vault_id tag
    todo!("CPI to Pool Program")
}
```

---

## 5. User Flows

### 5.3 Create Vault (from Vault_research.md)

From **Section 5.3** of Vault_research.md:

```
User D wants to create a DAO treasury:

1. D calls pool.create_vault() on L1
2. Pool creates permission group via CPI
3. D becomes Admin of vault
4. D can now add members
```

**Implementation:**

```typescript
// SDK
const vault = await vaultManager.createVault({
  name: "DAO Treasury",
  initialMembers: [], // Start empty, add later
});

// L1 transaction
tx = await program.methods
  .createVault(vault.id, "DAO Treasury")
  .accounts({
    vault: vaultPDA,
    admin: wallet.publicKey,
    perPermissionProgram: PER_PERMISSION_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### 5.4 Add Member to Vault (from Vault_research.md)

From **Section 5.4** of Vault_research.md:

```
Admin D adds User E to vault:

1. D calls pool.add_vault_member(vault_id, E, Member)
2. Permission group updated on L1
3. E can now:
   - See all vault balances
   - Deposit to vault
   - Transfer within vault
   - Withdraw own funds
```

**Implementation:**

```typescript
// SDK
await vaultManager.addMember({
  vaultId: vault.id,
  member: userE.publicKey,
  role: VaultRole.Member,
});

// L1 transaction
tx = await program.methods
  .addVaultMember(vault.id, userE.publicKey, { member: {} })
  .accounts({
    vault: vaultPDA,
    admin: wallet.publicKey,
    perPermissionProgram: PER_PERMISSION_PROGRAM_ID,
  })
  .rpc();
```

### 5.5 Deposit to Vault (from Vault_research.md)

From **Section 5.5** of Vault_research.md:

```
User E deposits to DAO vault:

1. E calls pool.deposit_to_vault(vault_id, 500 SOL)
2. Pool locks 500 SOL
3. PER creates Balance { owner: E, amount: 500, vault_id: Some(vault_id) }
4. All vault members can now see E's 500 SOL balance
5. Outsiders see nothing
```

**Implementation:**

```typescript
// SDK - First shield (regular deposit)
await poolManager.deposit({
  amount: 500_000_000, // 0.5 SOL
});

// Then tag with vault_id
await vaultManager.depositToVault({
  vaultId: vault.id,
  amount: 500_000_000,
});

// PER creates Balance with vault_id tag
// Now all vault members can query and see this balance
```

### 5.6 Cross-Type Transfer (from Vault_research.md)

From **Section 5.6** of Vault_research.md:

```
User E (in DAO vault) sends 100 SOL to User A (solo):

1. E authenticates to PER
2. E calls pool.transfer(A, 100)
3. PER checks E has ≥100 in vault
4. PER updates:
   - E.balance (in vault): 500 → 400
   - A.balance (solo): 50 → 150
5. Vault members see: "E sent 100 to external address"
6. A sees: "Received 100" (doesn't know it came from a vault)
7. Outside world sees: nothing
```

**Implementation:**

```typescript
// In PER execution layer
async function transfer(sender: Pubkey, receiver: Pubkey, amount: u64) {
  // Get sender balance
  const senderBalance = await getBalance(sender);

  // If sender is in vault, check permission
  if (senderBalance.vault_id !== null) {
    const hasPermission = await checkVaultPermission(
      senderBalance.vault_id,
      sender,
      VaultRole.Member,
    );
    require(hasPermission, "Not authorized");
  }

  // Execute transfer (ZK proof verifies balance conservation)
  await executeTransfer({
    from: senderBalance,
    to: receiver,
    amount,
  });

  // If receiver has vault_id, vault members can see incoming
  // If receiver is solo (vault_id: None), only receiver sees it
}
```

---

## 6. Security Model

### From Section 7 of Vault_research.md

#### 6.1 Defense in Depth

```
Layer 1: TEE (Intel TDX)
├── All pool state encrypted in hardware enclave
├── Even operator can't see individual balances
└── Attestation proves correct execution

Layer 2: Permissions (Solana L1)
├── Solo users: only self can access
├── Vault members: only group can access
└── Public verifiable permission changes

Layer 3: ZK Proofs (Noir)
├── Cryptographic proof of valid state transitions
├── No trust in operator required for settlement
└── Anyone can verify proofs on L1
```

#### 6.2 Threat Model

From **Section 7** of Vault_research.md:

| Threat                    | Solo User                   | Vault User                       | Mitigation             |
| ------------------------- | --------------------------- | -------------------------------- | ---------------------- |
| **Balance leak**          | Only if PER compromised     | Vault members see it (by design) | TEE + ZK fallback      |
| **Unauthorized transfer** | Can't happen (only owner)   | Only permitted roles             | Permission Program     |
| **Double spend**          | Nullifier prevents          | Nullifier prevents               | ZK proof               |
| **Front-running**         | Impossible (PER is private) | Impossible                       | No public mempool      |
| **Admin abuse**           | N/A                         | Admin can add/remove             | Choose admin carefully |

#### 6.3 Key Security Properties

1. **Solo Privacy**: Solo users (vault_id: None) are completely private
2. **Vault Transparency**: Vault members see each other (by design)
3. **External Privacy**: Outsiders can't see any vault operations
4. **Balance Conservation**: ZK proves no money is created/destroyed
5. **No Double-Spend**: Nullifiers prevent spending same commitment twice
6. **Permission Enforcement**: PER checks permissions before execution

---

## 7. References

### Related Blueprints

- **03_Vault_Circuits.md**: Simplified Noir circuits with vault_id tagging (no membership proofs)
- **Vault_research.md**: Original design document (sections 4-7)
- **31_Client_SDK.md**: SDK implementation for vault operations
- **30_API_Backend.md**: API endpoints for vault management

### Implementation Files

- `programs/vault/src/lib.rs` - Main vault program
- `programs/pool/src/lib.rs` - Pool program with vault integration
- See 31_Client_SDK.md for `packages/client-sdk/src/VaultManager.ts`

### PER Permission Program Documentation

- [MagicBlock PER Docs - Authorization](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/authorization)

---

## Summary

This blueprint provides **vault specifications** based on Vault_research.md:

✅ **Simple Vault Structure**: `{ vault_id, admin, permission_group }`
✅ **Permission Roles**: Viewer, Member, Admin (from section 4)
✅ **PER Integration**: CPI to Permission Program (not ZK proofs)
✅ **Core Functions**: create_vault, add_member, remove_member, deposit_to_vault
✅ **User Flows**: Sections 5.3-5.6 from Vault_research.md
✅ **Security Model**: Section 7 from Vault_research.md

**Design Principles:**

- No membership merkle trees - permissions are managed off-chain by PER
- No on-chain membership verification - delegated to PER Permission Program
- No multi-signature circuits - handled by PER
- Simple vault_id tagging on balances
- Unified solo/vault model

**Philosophy:**

> "A solo user is just a vault of 1 member"

**Next Steps:**

1. Deploy vault program to devnet
2. Integrate with PER Permission Program (CPI)
3. Update pool program to support vault_id tagging
4. Test vault creation and member management
5. Implement SDK (see 31_Client_SDK.md)

---

**Blueprint Status:** 🟢 Complete and ready for implementation
