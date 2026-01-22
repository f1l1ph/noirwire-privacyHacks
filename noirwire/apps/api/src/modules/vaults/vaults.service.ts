import { Injectable, NotFoundException } from "@nestjs/common";

@Injectable()
export class VaultsService {
  async createVault(name: string, _adminPubkey: string) {
    // TODO: Create vault on-chain
    // TODO: Store in database
    return {
      success: true,
      vaultId: "TODO_VAULT_ID",
      name,
    };
  }

  async getVault(id: string) {
    // TODO: Fetch from database
    throw new NotFoundException(`Vault ${id} not found`);
  }

  async getVaults() {
    // TODO: Fetch from database
    return [];
  }
}
