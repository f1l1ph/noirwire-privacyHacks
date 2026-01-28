import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false, // Use tsc for declarations
  sourcemap: false,
  clean: false,
  // Don't bundle dependencies - let Next.js/Turbopack handle them
  external: [
    "@aztec/bb.js",
    "@noir-lang/backend_barretenberg",
    "@noir-lang/noir_js",
    "@solana/web3.js",
    "@solana/buffer-layout",
    "@solana/buffer-layout-utils",
    "@coral-xyz/anchor",
    "bip39",
    "tweetnacl",
    "axios",
    "buffer",
  ],
  // Don't bundle node_modules
  noExternal: [],
  treeshake: true,
  splitting: false,
  // Disable code splitting for better Next.js compatibility
  esbuildOptions(options) {
    options.conditions = ["module"];
  },
});
