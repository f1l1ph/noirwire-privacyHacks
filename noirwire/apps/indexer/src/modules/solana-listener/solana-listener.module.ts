import { Module, OnModuleInit } from "@nestjs/common";
import { SolanaListenerService } from "./solana-listener.service";

@Module({
  providers: [SolanaListenerService],
})
export class SolanaListenerModule implements OnModuleInit {
  constructor(private readonly solanaListener: SolanaListenerService) {}

  onModuleInit() {
    this.solanaListener.startListening();
  }
}
