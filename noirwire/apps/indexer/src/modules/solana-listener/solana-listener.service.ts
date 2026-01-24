import { Injectable, Logger } from "@nestjs/common";
import { Connection, PublicKey, Logs } from "@solana/web3.js";

@Injectable()
export class SolanaListenerService {
  private readonly logger = new Logger(SolanaListenerService.name);
  private connection: Connection;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  startListening() {
    this.logger.log("Starting Solana event listener...");

    // TODO: Subscribe to program logs
    // TODO: Parse deposit events
    // TODO: Parse transfer events
    // TODO: Parse withdrawal events
    // TODO: Store in database

    this.logger.log("Solana listener started (stub implementation)");
  }

  async subscribeToProgram(programId: string) {
    const pubkey = new PublicKey(programId);

    this.connection.onLogs(pubkey, (logs) => {
      this.logger.debug(`Received logs for program ${programId}`);
      this.processLogs(logs);
    });
  }

  private processLogs(logs: Logs) {
    // TODO: Parse logs and extract events
    // TODO: Store in database
    this.logger.debug("Processing logs:", logs);
  }
}
