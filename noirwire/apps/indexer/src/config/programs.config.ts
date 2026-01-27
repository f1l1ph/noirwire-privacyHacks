/**
 * Solana Program IDs and Event Discriminators
 *
 * This file contains the deployed program addresses and event discriminators
 * extracted from the Anchor IDL files for parsing on-chain events.
 */

import { PublicKey } from "@solana/web3.js";

// ============================================
// Program IDs (from Anchor.toml [programs.devnet])
// ============================================

export const PROGRAMS = {
  SHIELDED_POOL: new PublicKey("NWRZDZJMfUAd3iVvdMhpsKht5bgHZGPzynHhQ2JssQ2"),
  ZK_VERIFIER: new PublicKey("NWRNe5ezj9SxCXVqrXbycbpT8drAvuaBknX3ChgGbnx"),
  VAULT_REGISTRY: new PublicKey("NWR5FUFsnn3x5gutivRDnBiFA6h1QZVVdAWM4PNdVEn"),
};

// ============================================
// Event Discriminators (from IDL events)
// ============================================

// Shielded Pool Events
export const DEPOSIT_EVENT_DISCRIMINATOR = Buffer.from([120, 248, 61, 83, 31, 142, 107, 144]);

export const WITHDRAW_EVENT_DISCRIMINATOR = Buffer.from([22, 9, 133, 26, 160, 44, 71, 192]);

export const BATCH_SETTLEMENT_EVENT_DISCRIMINATOR = Buffer.from([
  141, 156, 83, 170, 3, 176, 82, 175,
]);

export const NULLIFIER_RECORDED_EVENT_DISCRIMINATOR = Buffer.from([
  115, 87, 0, 228, 244, 12, 209, 136,
]);

// Vault Registry Events
export const VAULT_CREATED_EVENT_DISCRIMINATOR = Buffer.from([81, 80, 244, 58, 136, 54, 236, 111]);

export const MEMBER_ADDED_EVENT_DISCRIMINATOR = Buffer.from([110, 8, 43, 240, 226, 65, 159, 169]);

export const MEMBER_REMOVED_EVENT_DISCRIMINATOR = Buffer.from([193, 5, 252, 50, 110, 62, 254, 126]);

export const VAULT_CLOSED_EVENT_DISCRIMINATOR = Buffer.from([104, 71, 213, 247, 195, 133, 16, 106]);

// ============================================
// Event Type Enum
// ============================================

export enum EventType {
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw",
  BATCH_SETTLEMENT = "batch_settlement",
  NULLIFIER_RECORDED = "nullifier_recorded",
  VAULT_CREATED = "vault_created",
  MEMBER_ADDED = "member_added",
  MEMBER_REMOVED = "member_removed",
  VAULT_CLOSED = "vault_closed",
}

// ============================================
// Event Interfaces (matching IDL structures)
// ============================================

export interface DepositEvent {
  pool: string; // PublicKey as base58 string
  commitment: Uint8Array; // [u8; 32]
  amount: bigint; // u64
  new_root: Uint8Array; // [u8; 32]
  timestamp: bigint; // i64
}

export interface WithdrawEvent {
  pool: string; // PublicKey as base58 string
  nullifier: Uint8Array; // [u8; 32]
  amount: bigint; // u64
  recipient: string; // PublicKey as base58 string
  new_root: Uint8Array; // [u8; 32]
  timestamp: bigint; // i64
}

export interface BatchSettlementEvent {
  pool: string;
  old_root: Uint8Array;
  new_root: Uint8Array;
  nullifiers_root: Uint8Array;
  nullifier_count: number;
  timestamp: bigint;
}

export interface NullifierRecordedEvent {
  pool: string;
  nullifier: Uint8Array;
  nullifiers_root: Uint8Array;
  slot: bigint;
  timestamp: bigint;
}

export interface VaultCreatedEvent {
  vault_id: string; // Base58 encoded string
  admin_pubkey: string;
  members_root: Uint8Array;
  member_count: number;
  timestamp: bigint;
}

export interface MemberAddedEvent {
  vault_id: string;
  member_pubkey: string;
  new_members_root: Uint8Array;
  timestamp: bigint;
}

// ============================================
// Discriminator Mapping
// ============================================

export const EVENT_DISCRIMINATOR_MAP = new Map<string, EventType>([
  [DEPOSIT_EVENT_DISCRIMINATOR.toString("hex"), EventType.DEPOSIT],
  [WITHDRAW_EVENT_DISCRIMINATOR.toString("hex"), EventType.WITHDRAW],
  [BATCH_SETTLEMENT_EVENT_DISCRIMINATOR.toString("hex"), EventType.BATCH_SETTLEMENT],
  [NULLIFIER_RECORDED_EVENT_DISCRIMINATOR.toString("hex"), EventType.NULLIFIER_RECORDED],
  [VAULT_CREATED_EVENT_DISCRIMINATOR.toString("hex"), EventType.VAULT_CREATED],
  [MEMBER_ADDED_EVENT_DISCRIMINATOR.toString("hex"), EventType.MEMBER_ADDED],
  [MEMBER_REMOVED_EVENT_DISCRIMINATOR.toString("hex"), EventType.MEMBER_REMOVED],
  [VAULT_CLOSED_EVENT_DISCRIMINATOR.toString("hex"), EventType.VAULT_CLOSED],
]);

/**
 * Get event type from discriminator bytes
 */
export function getEventType(discriminator: Buffer): EventType | null {
  return EVENT_DISCRIMINATOR_MAP.get(discriminator.toString("hex")) || null;
}
