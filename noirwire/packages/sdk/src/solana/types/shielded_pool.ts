/**
 * Program IDL type for shielded_pool
 * Auto-generated type definitions for Anchor integration
 */

import type { Idl } from "@coral-xyz/anchor";

export interface ShieldedPool extends Idl {
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
  };
  version: "0.1.0";
  name: "shielded_pool";
  instructions: Array<any>;
  accounts: Array<any>;
  types: Array<any>;
  events?: Array<any>;
}
