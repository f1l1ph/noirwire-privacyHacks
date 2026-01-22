import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TransfersModule } from "./modules/transfers/transfers.module";
import { DepositsModule } from "./modules/deposits/deposits.module";
import { WithdrawalsModule } from "./modules/withdrawals/withdrawals.module";
import { VaultsModule } from "./modules/vaults/vaults.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    HealthModule,
    TransfersModule,
    DepositsModule,
    WithdrawalsModule,
    VaultsModule,
  ],
})
export class AppModule {}
