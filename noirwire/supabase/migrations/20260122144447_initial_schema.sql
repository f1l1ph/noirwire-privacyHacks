-- NoirWire Initial Schema
-- Created: 2026-01-22

-- ============================================
-- Commitments Table
-- ============================================
CREATE TABLE commitments (
  id BIGSERIAL PRIMARY KEY,
  commitment BYTEA NOT NULL UNIQUE,
  pool_address TEXT NOT NULL,
  amount BIGINT NOT NULL,
  owner_hash BYTEA,
  vault_id BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  leaf_index BIGINT,

  -- Constraints
  CONSTRAINT commitment_length CHECK (LENGTH(commitment) = 32)
);

CREATE INDEX idx_commitments_pool ON commitments(pool_address);
CREATE INDEX idx_commitments_vault ON commitments(vault_id) WHERE vault_id IS NOT NULL;
CREATE INDEX idx_commitments_leaf ON commitments(leaf_index) WHERE leaf_index IS NOT NULL;

-- ============================================
-- Nullifiers Table (spent commitments)
-- ============================================
CREATE TABLE nullifiers (
  id BIGSERIAL PRIMARY KEY,
  nullifier BYTEA NOT NULL UNIQUE,
  commitment BYTEA NOT NULL,
  pool_address TEXT NOT NULL,
  spent_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT nullifier_length CHECK (LENGTH(nullifier) = 32)
);

CREATE INDEX idx_nullifiers_pool ON nullifiers(pool_address);
CREATE INDEX idx_nullifiers_commitment ON nullifiers(commitment);

-- ============================================
-- Transactions Table
-- ============================================
CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  signature TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pool_address TEXT NOT NULL,
  amount BIGINT,
  nullifier BYTEA,
  commitment BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT tx_type CHECK (type IN ('deposit', 'transfer', 'withdraw', 'batch_settle')),
  CONSTRAINT tx_status CHECK (status IN ('pending', 'confirmed', 'failed'))
);

CREATE INDEX idx_transactions_pool ON transactions(pool_address);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);

-- ============================================
-- Vaults Table
-- ============================================
CREATE TABLE vaults (
  id BIGSERIAL PRIMARY KEY,
  vault_id BYTEA NOT NULL UNIQUE,
  name TEXT,
  members_root BYTEA NOT NULL,
  member_count INTEGER DEFAULT 1,
  admin_pubkey BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT vault_id_length CHECK (LENGTH(vault_id) = 32)
);

CREATE INDEX idx_vaults_admin ON vaults(admin_pubkey);

-- ============================================
-- Vault Members Table
-- ============================================
CREATE TABLE vault_members (
  id BIGSERIAL PRIMARY KEY,
  vault_id BYTEA NOT NULL REFERENCES vaults(vault_id),
  member_pubkey BYTEA NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  added_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT member_role CHECK (role IN ('admin', 'member')),
  UNIQUE (vault_id, member_pubkey)
);

CREATE INDEX idx_vault_members_vault ON vault_members(vault_id);
CREATE INDEX idx_vault_members_pubkey ON vault_members(member_pubkey);

-- ============================================
-- Merkle Tree State
-- ============================================
CREATE TABLE merkle_state (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL UNIQUE,
  root BYTEA NOT NULL,
  next_leaf_index BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Enable Row Level Security
-- ============================================
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nullifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE merkle_state ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Public Read Policies (adjust as needed)
-- ============================================
CREATE POLICY "Enable read access for all users" ON commitments FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON nullifiers FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON transactions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON vaults FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON vault_members FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON merkle_state FOR SELECT USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access" ON commitments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON nullifiers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON vaults FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON vault_members FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON merkle_state FOR ALL USING (auth.role() = 'service_role');
