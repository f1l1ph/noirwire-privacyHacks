import { Module } from "@nestjs/common";
import { SolanaListenerService } from "./solana-listener.service";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [DatabaseModule],
  providers: [SolanaListenerService],
})
export class SolanaListenerModule {}
