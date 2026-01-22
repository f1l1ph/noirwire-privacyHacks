import { Controller, Post, Body, Get } from "@nestjs/common";
import { TransfersService } from "./transfers.service";

@Controller("transfers")
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  async create(@Body() body: { proof: string; publicInputs: string[] }) {
    return this.transfersService.processTransfer(body.proof, body.publicInputs);
  }

  @Get()
  async list() {
    return this.transfersService.getTransfers();
  }
}
