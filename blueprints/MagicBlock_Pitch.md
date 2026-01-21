# Short Pitch — PER + Noir ZK Batch Settlement (Solana Privacy Hackathon)

**Goal:** Private transfers on Solana with **PER** for real‑time private execution and **Noir** for batch settlement proofs.

## How we use PER (technical)
- **Delegate** user state accounts to PER and execute transfers inside the TEE.
- **Permission Program** enforces read/write access (token‑gated PER RPC).
- **Commit/undelegate** on a cadence to sync settled state back to Solana.

## ZK layer (batch proving from PER)
- Batch $B$ PER transfers and generate a Noir proof of the private state transitions.
- Post proof + nullifiers for on‑chain verification (Anchor verifier).

## Stack
- Solana + Anchor, MagicBlock PER, Noir, Next.js, NestJS, Supabase
