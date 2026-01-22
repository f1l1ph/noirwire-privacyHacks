# Components — Private Transfer MVP (PER + Noir ZK)

## Can one PER block include multiple operations?

Yes. PER is an ER session, so it can process multiple transactions per block just like Solana, as long as your program logic allows those instruction types. You can mix operations (e.g., deposits, private transfers, withdrawals) within the same PER block.

## Recommendation on who runs PER/prover

For a hackathon MVP: **single operator** (your team) running the PER node and any ZK proving service. It’s simpler, cheaper, and faster to iterate. You can later move to a more distributed operator set if you need stronger decentralization.

## Required components (MVP)

### 1) On-chain programs (Solana)

- **Anchor program** for deposits/withdrawals and settlement
- **Permission Program interactions** (via CPI) to define access rules for private accounts

### 2) Private execution layer (MagicBlock)

- **PER node / TEE RPC** (MagicBlock endpoint)
- **Delegation/commit/undelegate flows** for the private accounts
- **Vault allowlist (future)**: role/group‑based list via the Permission Program for private reads/writes

### 3) Client app (Next.js)

- **Wallet auth** for signing the PER challenge
- **PER token handling** (authorization token in RPC headers/query)
- **Private transfer UI** (balances, transfers, history for authorized users)

### 4) API / backend (NestJS)

- **Light backend** for session management, metrics, and admin operations
- **Indexing pipeline** for L1 events + PER metadata + proof manifests

### 5) ZK layer (Noir)

- **Noir circuits** for batch proofs of correctness/compliance
- **Prover service** (batching and proof generation)
- **Verifier program** on Solana for proof verification
- **ZK scope**: settlement‑grade proofs (notes/nullifiers on‑chain)

### 6) Storage (Supabase)

- **Supabase Postgres** for notes, scans, caches, analytics, and proof metadata
- **Object storage** (Supabase Storage or S3) for proof artifacts and TEE attestation bundles

## Optional components (later)

- **Monitoring/alerts** for PER uptime and proof failures
- **Rate‑limit / API gateway** for production hardening

## Railgun comparison table (ordered)

| #   | Capability              | Railgun (typical)              | This stack (Solana + PER + Noir)                                                      |
| --- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | Private state           | Shielded pool + commitments    | PER‑delegated accounts inside TEE + permissions (optionally wallet‑allowlisted vault) |
| 2   | Double‑spend protection | Nullifier set on‑chain         | Noir nullifiers if ZK is used; otherwise PER permissions + account rules in MVP       |
| 3   | Proof generation        | Client or prover service       | Noir prover service (batch proofs) separate from PER execution                        |
| 4   | Verification            | On‑chain verifier              | Solana verifier program (Anchor)                                                      |
| 5   | Wallet privacy UX       | Viewing keys + local scan      | PER auth token for reads; optional viewing keys for ZK layer                          |
| 6   | Indexing                | Mandatory for notes/nullifiers | Mandatory: L1 events + PER metadata + proofs + note scans                             |
| 7   | Relayers                | Common (fee abstraction)       | Optional; privacy still holds without relayers if PER access is permissioned          |
| 8   | Compliance controls     | Usually external               | Not required for MVP (can add later)                                                  |
| 9   | Frontend                | Web/mobile wallets             | Next.js app                                                                           |
| 10  | Backend/API             | Relayer/indexer services       | NestJS API + indexer pipeline                                                         |
| 11  | Database                | Notes + scans + caches         | Supabase Postgres + object storage (notes/scans/caches + proofs)                      |

---

## Detailed Sequence Diagrams

### 1. Deposit Flow (Shield → Private)

```mermaid
sequenceDiagram
    participant User
    participant Wallet as Solana Wallet
    participant Client as NoirWire Client
    participant API as API Backend
    participant PER as PER Executor
    participant L1 as Solana L1
    participant Pool as Shielded Pool

    User->>Wallet: Connect wallet
    Wallet-->>User: Public key

    User->>Client: Deposit 100 SOL
    Client->>Client: Generate commitment<br/>(hash(owner, amount, salt, vault_id))

    Client->>L1: Submit deposit tx
    Note over Client,L1: deposit(amount, commitment, proof)

    L1->>Pool: Transfer 100 SOL to pool vault
    Pool->>Pool: Verify ZK proof
    Pool->>Pool: Update merkle root
    Pool->>Pool: Emit DepositEvent

    L1-->>Client: Tx confirmed

    Client->>API: Subscribe to commitment
    API->>API: Index DepositEvent
    API-->>Client: Deposit confirmed

    Client->>Client: Store commitment locally
    Client-->>User: Deposit complete ✓
```

### 2. Private Transfer Flow (PER Execution)

```mermaid
sequenceDiagram
    participant Sender as Sender (0zk wallet)
    participant Client as NoirWire Client
    participant API as API Backend
    participant PER as PER Executor (TEE)
    participant Prover as Noir Prover
    participant Receiver as Receiver

    Sender->>Client: Transfer 50 SOL to receiver
    Client->>Client: Fetch sender's commitments
    Client->>Client: Generate transfer inputs

    Client->>API: POST /transfer
    API->>PER: Forward transfer request

    PER->>PER: Validate sender balance
    PER->>Prover: Generate transfer proof
    Note over Prover: Prove:<br/>- Sender has balance<br/>- Amount conservation<br/>- Merkle membership

    Prover-->>PER: ZK proof

    PER->>PER: Update local merkle tree<br/>(sender, receiver commitments)
    PER->>PER: Add nullifier to pending set
    PER->>PER: Accumulate proof for batch

    PER-->>API: Transfer accepted
    API-->>Client: Transfer pending

    Client->>Client: Encrypt note for receiver
    Client->>API: Upload encrypted note

    API->>Receiver: Notify new transfer
    Receiver->>API: Fetch encrypted note
    Receiver->>Receiver: Decrypt with private key
    Receiver-->>Receiver: Balance updated locally

    Client-->>Sender: Transfer complete<br/>(pending settlement)
```

### 3. Batch Settlement Flow (PER → L1)

```mermaid
sequenceDiagram
    participant PER as PER Executor
    participant Aggregator as Batch Aggregator
    participant API as API Backend
    participant L1 as Solana L1
    participant Pool as Shielded Pool
    participant Verifier as ZK Verifier
    participant Users as All Users

    Note over PER: Batch threshold reached<br/>(100 transfers accumulated)

    PER->>Aggregator: Aggregate 100 proofs
    Note over Aggregator: Use multi-size batching:<br/>batch_64 + batch_32 + batch_4

    Aggregator->>Aggregator: Generate final proof
    Aggregator-->>PER: Aggregated proof

    PER->>L1: Submit settlement tx
    Note over PER,L1: settle_batch(<br/>  new_root,<br/>  nullifiers[100],<br/>  proof<br/>)

    L1->>Pool: Process batch
    Pool->>Verifier: Verify aggregated proof
    Verifier->>Verifier: alt_bn128 pairing check
    Verifier-->>Pool: Proof valid ✓

    Pool->>Pool: Create 100 nullifier PDAs
    Pool->>Pool: Update merkle root
    Pool->>Pool: Emit BatchSettlementEvent

    L1-->>PER: Settlement confirmed

    PER->>API: Update indexed state
    API->>API: Mark 100 transfers as settled

    API->>Users: Broadcast settlement notifications
    Users-->>Users: Transfers finalized on L1 ✓
```

### 4. Withdrawal Flow (Private → Unshield)

```mermaid
sequenceDiagram
    participant User
    participant Client as NoirWire Client
    participant API as API Backend
    participant PER as PER Executor
    participant L1 as Solana L1
    participant Pool as Shielded Pool
    participant Wallet as User's SOL Wallet

    User->>Client: Withdraw 50 SOL
    Client->>Client: Select commitment to spend
    Client->>Client: Generate nullifier

    Client->>API: POST /withdraw
    API->>PER: Forward withdraw request

    PER->>PER: Generate withdraw proof
    Note over PER: Prove:<br/>- Owns commitment<br/>- Has sufficient balance<br/>- Nullifier is unique

    PER-->>API: Proof generated
    API->>L1: Submit withdraw tx

    L1->>Pool: Process withdrawal
    Pool->>Pool: Verify ZK proof
    Pool->>Pool: Verify merkle root (historical)
    Pool->>Pool: Create nullifier PDA<br/>(prevents double-spend)

    Pool->>Pool: Update merkle root
    Pool->>Wallet: Transfer 50 SOL from vault
    Pool->>Pool: Emit WithdrawEvent

    L1-->>Client: Withdrawal confirmed

    Client->>Client: Mark commitment as spent
    Client->>API: Update local state

    Wallet-->>User: 50 SOL received ✓
```

### 5. Vault Creation & Transfer Flow

```mermaid
sequenceDiagram
    participant Admin as Vault Admin
    participant Client as NoirWire Client
    participant API as API Backend
    participant L1 as Solana L1
    participant Registry as Vault Registry
    participant Member1 as Member 1
    participant Member2 as Member 2

    Admin->>Client: Create vault "DAO Treasury"
    Client->>Client: Generate vault_id
    Client->>Client: Create members merkle tree

    Client->>L1: create_vault(vault_id, members_root)
    L1->>Registry: Initialize vault account
    Registry->>Registry: Store vault metadata
    Registry-->>L1: Vault created
    L1-->>Client: Vault PDA created

    Admin->>Member1: Share vault credentials
    Admin->>Member2: Share vault credentials

    Member1->>Client: Deposit to vault
    Client->>API: Deposit with vault_id
    Note over Client,API: Same as regular deposit,<br/>but with vault_id set

    Member2->>Client: View vault balances
    Client->>API: GET /vaults/:id/balances
    API->>API: Verify member authorization
    API-->>Client: Return vault balances<br/>(visible to all members)

    Member1->>Client: Transfer within vault to Member2
    Client->>Client: Generate vault transfer proof
    Note over Client: Prove:<br/>- Sender is vault member<br/>- Receiver is vault member<br/>- Sender has balance

    Client->>API: POST /vault/transfer
    API->>API: Verify both are members
    API-->>Client: Transfer processed

    Member2->>Client: Check balance
    Client-->>Member2: Balance updated<br/>(visible to vault members)
```

### 6. End-to-End Privacy Flow

```
User A (Public)                    |  SHIELDED POOL (Private)  |  User B (Public)
                                   |                           |
1. Deposit 100 SOL ────────────────>│   Commitment A: 100      │
   (visible on L1)                 │   (nobody knows owner)   │
                                   │                           │
2. Private Transfer ───────────────>│   Nullify A              │
   50 SOL to User B                │   Commitment A': 50       │
   (happens inside PER/TEE)        │   Commitment B: 50        │
                                   │   (unlinkable transfers)  │
                                   │                           │
                                   │   User B withdraws ───────>  3. Receive 50 SOL
                                   │   (visible on L1)         │     (visible on L1)
                                   │                           │

Privacy Properties:
✓ Nobody knows User A has 100 SOL (commitment is hash)
✓ Nobody knows 50 SOL went from A → B (happens in TEE)
✓ Nobody can link User A's deposit to User B's withdrawal
✓ Only User B knows they received from someone (note decryption)
✓ Even PER operator can't see balances (encrypted in TEE)
```

---

## Future todo table

| Item                       | Status | Notes                                                                        |
| -------------------------- | ------ | ---------------------------------------------------------------------------- |
| Relayers                   | Future | Add if you want fee abstraction or sender obfuscation at the mempool level.  |
| Role/group vault allowlist | Future | Implement via Permission Program groups once policy is defined.              |
| Fully opaque settlement    | Future | Hide even batch totals; requires more careful proof design and UX tradeoffs. |
