import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import { DatabaseService } from "../database/database.service";
import { PROGRAMS } from "../../config/programs.config";
import shieldedPoolIdl from "../../../../../packages/solana-programs/target/idl/shielded_pool.json";
import vaultRegistryIdl from "../../../../../packages/solana-programs/target/idl/vault_registry.json";

@Injectable()
export class SolanaListenerService implements OnModuleInit {
  private readonly logger = new Logger(SolanaListenerService.name);
  private connection: Connection;
  private shieldedPoolCoder: BorshCoder;
  private vaultRegistryCoder: BorshCoder;
  private shieldedPoolParser: EventParser;
  private vaultRegistryParser: EventParser;

  constructor(private readonly databaseService: DatabaseService) {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: process.env.SOLANA_WS_URL,
    });

    // Initialize Anchor coders for event parsing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.shieldedPoolCoder = new BorshCoder(shieldedPoolIdl as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.vaultRegistryCoder = new BorshCoder(vaultRegistryIdl as any);

    // Initialize event parsers
    this.shieldedPoolParser = new EventParser(PROGRAMS.SHIELDED_POOL, this.shieldedPoolCoder);
    this.vaultRegistryParser = new EventParser(PROGRAMS.VAULT_REGISTRY, this.vaultRegistryCoder);
  }

  async onModuleInit() {
    this.logger.log("Initializing Solana event listener...");
    await this.startListening();
  }

  async startListening() {
    this.logger.log("Starting Solana event listener...");

    try {
      // Subscribe to Shielded Pool program
      await this.subscribeToProgram(PROGRAMS.SHIELDED_POOL.toBase58(), "Shielded Pool");

      // Subscribe to Vault Registry program
      await this.subscribeToProgram(PROGRAMS.VAULT_REGISTRY.toBase58(), "Vault Registry");

      this.logger.log("Successfully subscribed to all programs");
    } catch (error) {
      this.logger.error(`Failed to start listening: ${error}`);
      // Retry after 5 seconds
      setTimeout(() => this.startListening(), 5000);
    }
  }

  async subscribeToProgram(programId: string, programName: string) {
    const pubkey = new PublicKey(programId);

    this.logger.log(`Subscribing to ${programName} logs: ${programId}`);

    this.connection.onLogs(
      pubkey,
      (logs) => {
        this.processLogs(logs, programName).catch((error) => {
          this.logger.error(`Error processing logs from ${programName}:`, error);
        });
      },
      "confirmed",
    );
  }

  private async processLogs(logs: Logs, programName: string) {
    const signature = logs.signature;
    this.logger.debug(`Processing logs from ${programName}, signature: ${signature}`);

    try {
      // Check for errors
      if (logs.err) {
        this.logger.warn(`Transaction failed: ${signature}`);
        return;
      }

      // Parse events from logs
      const parser =
        programName === "Shielded Pool" ? this.shieldedPoolParser : this.vaultRegistryParser;

      const events = parser.parseLogs(logs.logs);

      for (const event of events) {
        await this.handleEvent(event.name, event.data, signature, programName);
      }
    } catch (error) {
      this.logger.error(`Failed to process logs for ${signature}: ${error}`);
    }
  }

  private async handleEvent(
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventData: any,
    signature: string,
    programName: string,
  ) {
    this.logger.debug(`Handling event: ${eventName} from ${programName}`);

    try {
      switch (eventName) {
        case "DepositEvent":
          await this.handleDepositEvent(eventData, signature);
          break;

        case "WithdrawEvent":
          await this.handleWithdrawEvent(eventData, signature);
          break;

        case "VaultCreatedEvent":
          await this.handleVaultCreatedEvent(eventData, signature);
          break;

        case "MemberAddedEvent":
          await this.handleMemberAddedEvent(eventData, signature);
          break;

        case "BatchSettlementEvent":
          this.logger.log(`Batch settlement event: ${signature}`);
          // Update merkle root from batch settlement
          await this.databaseService.updateMerkleState({
            poolAddress: eventData.pool.toBase58(),
            root: Buffer.from(eventData.newRoot).toString("hex"),
            leafCount: await this.databaseService.getNextLeafIndex(eventData.pool.toBase58()),
          });
          break;

        case "NullifierRecordedEvent":
          this.logger.log(`Nullifier recorded: ${signature}`);
          await this.databaseService.insertNullifier({
            nullifier: Buffer.from(eventData.nullifier).toString("hex"),
            poolAddress: eventData.pool.toBase58(),
            transactionSignature: signature,
          });
          break;

        default:
          this.logger.debug(`Unhandled event type: ${eventName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle event ${eventName}: ${error}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleDepositEvent(eventData: any, signature: string) {
    const poolAddress = eventData.pool.toBase58();
    const commitment = Buffer.from(eventData.commitment).toString("hex");
    const amount = BigInt(eventData.amount.toString());
    const newRoot = Buffer.from(eventData.newRoot).toString("hex");

    this.logger.log(
      `Deposit event: pool=${poolAddress}, amount=${amount}, commitment=${commitment.substring(0, 16)}...`,
    );

    // Get next leaf index
    const leafIndex = await this.databaseService.getNextLeafIndex(poolAddress);

    // Insert commitment
    await this.databaseService.insertCommitment({
      commitment,
      poolAddress,
      amount,
      ownerHash: null, // Owner is private
      vaultId: null, // Will be populated by PER if using vault
      leafIndex,
    });

    // Insert transaction record
    await this.databaseService.insertTransaction({
      signature,
      type: "deposit",
      status: "confirmed",
      poolAddress,
      amount,
      commitment,
    });

    // Update merkle state
    await this.databaseService.updateMerkleState({
      poolAddress,
      root: newRoot,
      leafCount: leafIndex + 1,
    });

    this.logger.log(`Successfully processed deposit: ${signature}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleWithdrawEvent(eventData: any, signature: string) {
    const poolAddress = eventData.pool.toBase58();
    const nullifier = Buffer.from(eventData.nullifier).toString("hex");
    const amount = BigInt(eventData.amount.toString());
    const newRoot = Buffer.from(eventData.newRoot).toString("hex");

    this.logger.log(
      `Withdraw event: pool=${poolAddress}, amount=${amount}, nullifier=${nullifier.substring(0, 16)}...`,
    );

    // Insert nullifier
    await this.databaseService.insertNullifier({
      nullifier,
      poolAddress,
      transactionSignature: signature,
    });

    // Insert transaction record
    await this.databaseService.insertTransaction({
      signature,
      type: "withdraw",
      status: "confirmed",
      poolAddress,
      amount,
      nullifier,
    });

    // Update merkle state with new root
    await this.databaseService.updateMerkleState({
      poolAddress,
      root: newRoot,
      leafCount: await this.databaseService.getNextLeafIndex(poolAddress),
    });

    this.logger.log(`Successfully processed withdrawal: ${signature}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleVaultCreatedEvent(eventData: any, signature: string) {
    const vaultId = eventData.vaultId.toString(); // Assuming it's a bigint or similar
    const adminPubkey = eventData.adminPubkey.toBase58();
    const membersRoot = Buffer.from(eventData.membersRoot).toString("hex");
    const memberCount = eventData.memberCount;

    this.logger.log(
      `Vault created: vaultId=${vaultId}, admin=${adminPubkey}, memberCount=${memberCount}`,
    );

    await this.databaseService.createVault({
      vaultId,
      name: `Vault ${vaultId}`,
      membersRoot,
      memberCount,
      adminPubkey,
    });

    this.logger.log(`Successfully processed vault creation: ${signature}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleMemberAddedEvent(eventData: any, signature: string) {
    const vaultId = eventData.vaultId.toString();
    const memberPubkey = eventData.memberPubkey.toBase58();

    this.logger.log(`Member added: vaultId=${vaultId}, member=${memberPubkey}`);

    await this.databaseService.addVaultMember({
      vaultId,
      memberPubkey,
    });

    this.logger.log(`Successfully processed member addition: ${signature}`);
  }
}
