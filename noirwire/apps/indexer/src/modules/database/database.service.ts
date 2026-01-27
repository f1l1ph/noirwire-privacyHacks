import { Injectable, Logger } from "@nestjs/common";
import { supabase, insertCommitment, insertTransaction, createVault } from "@noirwire/db";
import type { Commitment, Transaction, Vault } from "@noirwire/types";

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  /**
   * Insert a commitment into the database
   */
  async insertCommitment(data: {
    commitment: string;
    poolAddress: string;
    amount: bigint;
    ownerHash: string | null;
    vaultId: string | null;
    leafIndex: number;
  }): Promise<Commitment> {
    try {
      this.logger.debug(
        `Inserting commitment: ${data.commitment.substring(0, 16)}... at leaf ${data.leafIndex}`,
      );

      const result = await insertCommitment({
        commitment: data.commitment,
        poolAddress: data.poolAddress,
        amount: data.amount,
        ownerHash: data.ownerHash ?? undefined,
        vaultId: data.vaultId ?? undefined,
        leafIndex: data.leafIndex,
      });

      this.logger.log(`Successfully inserted commitment at leaf ${data.leafIndex}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to insert commitment: ${error}`);
      throw error;
    }
  }

  /**
   * Insert a nullifier into the database
   */
  async insertNullifier(data: {
    nullifier: string;
    poolAddress: string;
    transactionSignature: string;
  }): Promise<void> {
    try {
      this.logger.debug(`Inserting nullifier: ${data.nullifier.substring(0, 16)}...`);

      const { error } = await supabase.from("nullifiers").insert({
        nullifier: data.nullifier,
        pool_address: data.poolAddress,
        transaction_signature: data.transactionSignature,
        spent_at: new Date().toISOString(),
      });

      if (error) throw error;

      this.logger.log(`Successfully inserted nullifier`);
    } catch (error) {
      this.logger.error(`Failed to insert nullifier: ${error}`);
      throw error;
    }
  }

  /**
   * Insert a transaction record
   */
  async insertTransaction(data: {
    signature: string;
    type: "deposit" | "withdraw" | "transfer";
    status: "pending" | "confirmed" | "failed";
    poolAddress: string;
    amount?: bigint;
    nullifier?: string;
    commitment?: string;
  }): Promise<Transaction> {
    try {
      this.logger.debug(`Inserting transaction: ${data.signature}`);

      const result = await insertTransaction({
        signature: data.signature,
        type: data.type,
        status: data.status,
        poolAddress: data.poolAddress,
        amount: data.amount,
        nullifier: data.nullifier,
        commitment: data.commitment,
      });

      this.logger.log(`Successfully inserted transaction: ${data.signature}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to insert transaction: ${error}`);
      throw error;
    }
  }

  /**
   * Create a vault record
   */
  async createVault(data: {
    vaultId: string;
    name: string;
    membersRoot: string;
    memberCount: number;
    adminPubkey: string;
  }): Promise<Vault> {
    try {
      this.logger.debug(`Creating vault: ${data.vaultId}`);

      const result = await createVault({
        vaultId: data.vaultId,
        name: data.name,
        membersRoot: data.membersRoot,
        memberCount: data.memberCount,
        adminPubkey: data.adminPubkey,
      });

      this.logger.log(`Successfully created vault: ${data.vaultId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to create vault: ${error}`);
      throw error;
    }
  }

  /**
   * Add a member to a vault
   */
  async addVaultMember(data: { vaultId: string; memberPubkey: string }): Promise<void> {
    try {
      this.logger.debug(`Adding member ${data.memberPubkey} to vault ${data.vaultId}`);

      const { error } = await supabase.from("vault_members").insert({
        vault_id: data.vaultId,
        member_pubkey: data.memberPubkey,
        added_at: new Date().toISOString(),
      });

      if (error) throw error;

      this.logger.log(`Successfully added vault member`);
    } catch (error) {
      this.logger.error(`Failed to add vault member: ${error}`);
      throw error;
    }
  }

  /**
   * Update merkle tree state
   */
  async updateMerkleState(data: {
    poolAddress: string;
    root: string;
    leafCount: number;
  }): Promise<void> {
    try {
      this.logger.debug(
        `Updating merkle state for pool ${data.poolAddress}: root=${data.root.substring(0, 16)}..., leafCount=${data.leafCount}`,
      );

      // Upsert the merkle state
      const { error } = await supabase.from("merkle_state").upsert(
        {
          pool_address: data.poolAddress,
          current_root: data.root,
          leaf_count: data.leafCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pool_address" },
      );

      if (error) throw error;

      this.logger.log(`Successfully updated merkle state`);
    } catch (error) {
      this.logger.error(`Failed to update merkle state: ${error}`);
      throw error;
    }
  }

  /**
   * Get current merkle root for a pool
   */
  async getCurrentRoot(poolAddress: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("merkle_state")
        .select("current_root")
        .eq("pool_address", poolAddress)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return data?.current_root || null;
    } catch (error) {
      this.logger.error(`Failed to get current root: ${error}`);
      return null;
    }
  }

  /**
   * Get next leaf index for a pool
   */
  async getNextLeafIndex(poolAddress: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from("merkle_state")
        .select("leaf_count")
        .eq("pool_address", poolAddress)
        .single();

      if (error) {
        if (error.code === "PGRST116") return 0; // Not found, start at 0
        throw error;
      }

      return data?.leaf_count || 0;
    } catch (error) {
      this.logger.error(`Failed to get next leaf index: ${error}`);
      return 0;
    }
  }
}
