import { Controller, Post, Body, Get } from "@nestjs/common";
import { DepositsService } from "./deposits.service";

@Controller("deposits")
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  async create(@Body() body: { commitment: string; amount: string; signature: string }) {
    return this.depositsService.processDeposit(body.commitment, body.amount, body.signature);
  }

  @Get()
  async list() {
    return this.depositsService.getDeposits();
  }
}
