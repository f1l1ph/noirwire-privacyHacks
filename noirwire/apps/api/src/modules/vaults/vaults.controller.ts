import { Controller, Post, Body, Get, Param } from "@nestjs/common";
import { VaultsService } from "./vaults.service";

@Controller("vaults")
export class VaultsController {
  constructor(private readonly vaultsService: VaultsService) {}

  @Post()
  async create(@Body() body: { name: string; adminPubkey: string }) {
    return this.vaultsService.createVault(body.name, body.adminPubkey);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.vaultsService.getVault(id);
  }

  @Get()
  async list() {
    return this.vaultsService.getVaults();
  }
}
