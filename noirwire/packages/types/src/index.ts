// NoirWire Shared Types

// ============================================
// API Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Blockchain Types
// ============================================

export interface Commitment {
  commitment: string;
  poolAddress: string;
  amount: bigint;
  ownerHash?: string;
  vaultId?: string;
  leafIndex?: number;
  createdAt: Date;
}

export interface Nullifier {
  nullifier: string;
  commitment: string;
  spentAt: Date;
}

export interface MerkleProof {
  siblings: string[];
  pathIndices: number[];
}

// ============================================
// Wallet Types
// ============================================

export interface NoirWireWalletConfig {
  network: "mainnet" | "devnet" | "localnet";
  rpcUrl?: string;
}

export interface Balance {
  owner: string;
  amount: bigint;
  salt: string;
  vaultId?: string;
}

export interface EncryptedNote {
  ciphertext: string;
  ephemeralPublicKey: string;
  nonce: string;
}

// ============================================
// Vault Types
// ============================================

export interface Vault {
  vaultId: string;
  name?: string;
  membersRoot: string;
  memberCount: number;
  adminPubkey: string;
  createdAt: Date;
}

export interface VaultMember {
  vaultId: string;
  memberPubkey: string;
  role: "admin" | "member";
  addedAt: Date;
}

// ============================================
// ZK Proof Types
// ============================================

export interface ZkProof {
  proof: string;
  publicInputs: string[];
}

export interface TransferProofInputs {
  nullifier: string;
  oldRoot: string;
  newRoot: string;
  encryptedNote: string;
}

export interface DepositProofInputs {
  depositAmount: string;
  newCommitment: string;
  newRoot: string;
}

export interface WithdrawProofInputs {
  nullifier: string;
  withdrawAmount: string;
  recipientAddress: string;
  oldRoot: string;
  newRoot: string;
}

// ============================================
// Transaction Types
// ============================================

export type TransactionType =
  | "deposit"
  | "transfer"
  | "withdraw"
  | "batch_settle";
export type TransactionStatus = "pending" | "confirmed" | "failed";

export interface Transaction {
  id: string;
  signature: string;
  type: TransactionType;
  status: TransactionStatus;
  poolAddress: string;
  amount?: bigint;
  nullifier?: string;
  commitment?: string;
  createdAt: Date;
  confirmedAt?: Date;
}
