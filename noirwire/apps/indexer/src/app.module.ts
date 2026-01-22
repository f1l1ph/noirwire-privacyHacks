import { Module } from "@nestjs/common";
import { SolanaListenerModule } from "./modules/solana-listener/solana-listener.module";

@Module({
  imports: [SolanaListenerModule],
})
export class AppModule {}
