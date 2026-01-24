import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ShieldedPool } from "../target/types/shielded_pool";

describe("shielded-pool", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.ShieldedPool as Program<ShieldedPool>;

  it("Is initialized!", async () => {
    // Add your test here.
    console.log("Your transaction signature");
  });
});
