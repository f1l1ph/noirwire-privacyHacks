# Abstract — PER + Noir ZK (Solana)

We propose a fast, private DeFi execution layer on Solana that combines MagicBlock’s Private Ephemeral Rollup (PER) with periodic Zero‑Knowledge proofs written in Noir, while keeping the standard Solana/Anchor stack for on‑chain settlement. Transactions execute quickly inside PER (TEE‑backed privacy + permissions). At defined intervals, the system produces a Noir‑based proof attesting to correct state transitions without revealing private user state, and posts it to Solana for verification. The user‑facing stack is a Next.js dApp + NestJS API, with Supabase for notes/scans/caches and proof metadata.

This design targets real‑time UX (PER) plus cryptographic assurances (ZK), with cost amortized across batches. It is intended as an initial hackathon abstract for the Solana Privacy Hackathon.

## Overview

MagicBlock’s PER runs an Ephemeral Rollup (ER) inside an Intel TDX TEE, adding confidentiality and access control while retaining Solana composability. Programs can define permissioned accounts via the on‑chain Permission Program, and clients authenticate to receive an authorization token for private reads/writes. This gives fast, private execution for delegated accounts without changing the Solana programming model.

We layer Noir ZK proofs on top of this fast private execution. The idea is to batch multiple PER transactions and periodically generate a proof that the private state transitions were valid (and optionally met compliance constraints), then verify that proof on Solana. This preserves low‑latency user experience inside PER while adding cryptographic assurances at settlement time.

### Stack

- Solana + Anchor program(s) for settlement and verification
- MagicBlock PER for private, low‑latency execution and access control
- Noir (ZK circuits) for batch proofs of correctness/compliance
- Next.js dApp + NestJS API
- Supabase (Postgres + object storage)
