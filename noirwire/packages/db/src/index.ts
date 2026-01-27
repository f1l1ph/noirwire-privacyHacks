// NoirWire Database Package

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Commitment, Transaction, Vault } from "@noirwire/types";

// ============================================
// Supabase Client
// ============================================

function getEnv(key: string, fallback?: string): string | undefined {
  // Safe env access for build time
  if (typeof process === "undefined" || !process.env) {
    return fallback;
  }
  return process.env[key] || fallback;
}

// Detect browser vs server to read the correct env vars
const isBrowser = typeof window !== "undefined";

const supabaseUrl = isBrowser
  ? getEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")!
  : getEnv("SUPABASE_URL", "http://localhost:54321")!;

const supabaseKey = isBrowser
  ? getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  : getEnv("SUPABASE_ANON_KEY");

// Placeholder for build time, actual key required at runtime
const effectiveKey =
  supabaseKey ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const supabase: SupabaseClient = createClient(supabaseUrl, effectiveKey);

// ============================================
// Commitment Queries
// ============================================

export async function getCommitmentsByPool(poolAddress: string): Promise<Commitment[]> {
  const { data, error } = await supabase
    .from("commitments")
    .select("*")
    .eq("pool_address", poolAddress)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    commitment: row.commitment,
    poolAddress: row.pool_address,
    amount: BigInt(row.amount),
    ownerHash: row.owner_hash,
    vaultId: row.vault_id,
    leafIndex: row.leaf_index,
    createdAt: new Date(row.created_at),
  }));
}

export async function insertCommitment(
  commitment: Omit<Commitment, "createdAt">,
): Promise<Commitment> {
  const { data, error } = await supabase
    .from("commitments")
    .insert({
      commitment: commitment.commitment,
      pool_address: commitment.poolAddress,
      amount: commitment.amount.toString(),
      owner_hash: commitment.ownerHash,
      vault_id: commitment.vaultId,
      leaf_index: commitment.leafIndex,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    commitment: data.commitment,
    poolAddress: data.pool_address,
    amount: BigInt(data.amount),
    ownerHash: data.owner_hash,
    vaultId: data.vault_id,
    leafIndex: data.leaf_index,
    createdAt: new Date(data.created_at),
  };
}

// ============================================
// Transaction Queries
// ============================================

export async function getTransactionsByPool(poolAddress: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("pool_address", poolAddress)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id.toString(),
    signature: row.signature,
    type: row.type,
    status: row.status,
    poolAddress: row.pool_address,
    amount: row.amount ? BigInt(row.amount) : undefined,
    nullifier: row.nullifier,
    commitment: row.commitment,
    createdAt: new Date(row.created_at),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
  }));
}

export async function insertTransaction(
  transaction: Omit<Transaction, "id" | "createdAt" | "confirmedAt">,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      signature: transaction.signature,
      type: transaction.type,
      status: transaction.status,
      pool_address: transaction.poolAddress,
      amount: transaction.amount?.toString(),
      nullifier: transaction.nullifier,
      commitment: transaction.commitment,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id.toString(),
    signature: data.signature,
    type: data.type,
    status: data.status,
    poolAddress: data.pool_address,
    amount: data.amount ? BigInt(data.amount) : undefined,
    nullifier: data.nullifier,
    commitment: data.commitment,
    createdAt: new Date(data.created_at),
    confirmedAt: data.confirmed_at ? new Date(data.confirmed_at) : undefined,
  };
}

// ============================================
// Vault Queries
// ============================================

export async function getVaultById(vaultId: string): Promise<Vault | null> {
  const { data, error } = await supabase
    .from("vaults")
    .select("*")
    .eq("vault_id", vaultId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }

  return {
    vaultId: data.vault_id,
    name: data.name,
    membersRoot: data.members_root,
    memberCount: data.member_count,
    adminPubkey: data.admin_pubkey,
    createdAt: new Date(data.created_at),
  };
}

export async function createVault(vault: Omit<Vault, "createdAt">): Promise<Vault> {
  const { data, error } = await supabase
    .from("vaults")
    .insert({
      vault_id: vault.vaultId,
      name: vault.name,
      members_root: vault.membersRoot,
      member_count: vault.memberCount,
      admin_pubkey: vault.adminPubkey,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    vaultId: data.vault_id,
    name: data.name,
    membersRoot: data.members_root,
    memberCount: data.member_count,
    adminPubkey: data.admin_pubkey,
    createdAt: new Date(data.created_at),
  };
}
