# NoirWire Devnet Deployment Status

**Date**: 2026-01-29
**Deployment Target**: Solana Devnet

---

## ✅ COMPLETED

### Programs Deployed to Devnet
All three programs successfully deployed and verified on devnet:

```bash
shielded_pool:    NWRZDZJMfUAd3iVvdMhpsKht5bgHZGPzynHhQ2JssQ2
zk_verifier:      NWRNe5ezj9SxCXVqrXbycbpT8drAvuaBknX3ChgGbnx
vault_registry:   NWR5FUFsnn3x5gutivRDnBiFA6h1QZVVdAWM4PNdVEn
```

**Deployer Wallet**: `42UU1MVEAT3tsD3EuzsHaQSWsXJ4M5MyDGRMmNSrsdHL`

### Configuration
- ✅ `Anchor.toml` configured for devnet
- ✅ `.env.local` has correct program IDs
- ✅ Devnet wallet keypair stored in `.devnet-keypair.json` (gitignored)

---

## ❌ BLOCKED ITEMS

### 1. Verification Key Deployment - CRITICAL
**Status**: ❌ Failing
**Issue**: Barretenberg backend (v0.35.0) cannot deserialize Noir circuit bytecode
```
Error [RuntimeError]: unreachable at bincodeDeserialize
```

**Root Cause**: Version mismatch between:
- Noir circuits (compiled with unknown version)
- `@noir-lang/backend_barretenberg`: 0.35.0

### 2. Pool Initialization
**Status**: ⚠️ Deferred
**Issue**: Initialization scripts have dependency/configuration issues:
- `init-pool.ts`: IDL loading error ("Cannot read properties of undefined (reading 'size')")
- `initialize-pool.ts`: Missing `js-sha3` dependency

---

## 📋 TODO

### HIGH PRIORITY

- [ ] **Fix VK Generation**
  - Check Noir version used to compile circuits: `cd packages/noir-circuits && nargo --version`
  - Either:
    - Recompile circuits with Noir 0.35.0, OR
    - Update `@noir-lang/backend_barretenberg` to match circuit version
  - Run: `ANCHOR_WALLET=.devnet-keypair.json ANCHOR_PROVIDER_URL=https://api.devnet.solana.com yarn generate-and-deploy-vks`

- [ ] **Initialize Pool on Devnet**
  - Option A: Fix initialization scripts (add missing deps, fix IDL loading)
  - Option B: Create minimal init script without extra dependencies
  - Option C: Initialize via web app on first use
  - Required: Pool PDA, historical roots PDA, VK hash

- [ ] **Update Environment Variables**
  - Replace `NEXT_PUBLIC_VERIFICATION_KEY` in `apps/web/.env.local`
  - Update with actual deployed VK address (after VK deployment succeeds)

### MEDIUM PRIORITY

- [ ] **Test End-to-End Flow**
  - Start web app: `cd apps/web && yarn dev`
  - Test wallet creation
  - Attempt deposit (will fail without VKs but tests connection)

- [ ] **Commit Changes**
  ```bash
  git add .
  git commit -m "feat: deploy programs to devnet

  - Deploy shielded_pool, zk_verifier, vault_registry to devnet
  - Configure Anchor.toml for devnet cluster
  - Add devnet wallet keypair (.gitignored)

  Remaining work:
  - Fix VK generation (Noir version mismatch)
  - Initialize pool on devnet
  - Test end-to-end flow"
  ```

### LOW PRIORITY

- [ ] **Strengthen Security**
  - Implement proper `per_authority` validation (currently only checks != default)
  - See COLLEAGUE_REVIEW.md MISTAKE #2 for details

---

## 🚀 QUICK START (After VKs Fixed)

```bash
# Set environment
export ANCHOR_WALLET=.devnet-keypair.json
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com

# Deploy VKs (after fixing version mismatch)
yarn generate-and-deploy-vks

# Initialize pool
yarn init-pool:devnet

# Update .env.local with VK addresses
# Then start web app
cd ../../apps/web
yarn dev
```

---

## 📝 NOTES

- **COLLEAGUE_REVIEW.md** incorrectly flagged `AccountLoader` change as a mistake
  - `HistoricalRoots` uses `Vec<[u8; 32]>` which requires borsh serialization
  - Cannot use `AccountLoader` (requires `ZeroCopy` trait)
  - `Account` was the correct choice

- Security fixes from colleague's work were correctly implemented:
  - ✅ CRITICAL-03: Historical roots capacity increased to 900
  - ✅ CRITICAL-02: Path indices added for merkle ordering
  - ✅ CRITICAL-05: per_authority validation added (though needs strengthening)

---

**Next Action**: Fix Noir/Barretenberg version mismatch to enable VK deployment
