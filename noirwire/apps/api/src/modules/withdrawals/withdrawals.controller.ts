import { Controller, Post, Body, Get } from "@nestjs/common";
import { WithdrawalsService } from "./withdrawals.service";

@Controller("withdrawals")
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post()
  async create(
    @Body() body: { proof: string; publicInputs: string[]; recipient: string },
  ) {
    return this.withdrawalsService.processWithdrawal(
      body.proof,
      body.publicInputs,
      body.recipient,
    );
  }

  @Get()
  async list() {
    return this.withdrawalsService.getWithdrawals();
  }
}
