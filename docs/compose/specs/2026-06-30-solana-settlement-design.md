# Solana Settlement Layer — Full-Chain Design

Date: 2026-06-30

## [S1] Problem

OmniClaw's settlement is mock-only. The `SettlementAdapter` interface exists with a `MockSettlementAdapter`, but no real Solana program or onchain interaction exists. To make the agent labor marketplace可信, we need a real Anchor escrow program on Solana, a TypeScript adapter to replace the mock, and deployment tooling for devnet.

## [S2] Solution Overview

Build a full-chain settlement layer:

1. **Anchor program** (`programs/escrow/`) — PDA-based escrow state machine with 7 instructions
2. **TypeScript client** (`packages/solana-client/`) — `SolanaSettlementAdapter` implementing the existing `SettlementAdapter` interface
3. **Deployment scripts** — Anchor build/deploy for devnet
4. **API integration** — Wire the new adapter into `apps/api` via config

Scope: devnet-first, SOL-only, no test suite in this phase.

## [S3] Anchor Program Architecture

### PDA Account: `EscrowAccount`

PDA seeds: `["escrow", task_id.as_ref()]`

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | `[u8; 32]` | Task hash, used as PDA seed |
| `hirer` | `Pubkey` | Hirer wallet address |
| `worker` | `Pubkey` | Worker wallet address |
| `amount` | `u64` | Locked lamports |
| `platform_fee_bps` | `u16` | Platform fee in basis points |
| `runtime_fee_bps` | `u16` | Runtime fee in basis points |
| `platform_wallet` | `Pubkey` | Platform fee recipient |
| `runtime_wallet` | `Pubkey` | Runtime fee recipient |
| `deadline` | `i64` | Unix timestamp deadline |
| `status` | `EscrowStatus` | Current state |
| `bump` | `u8` | PDA bump seed |

### EscrowStatus Enum

```
Initialized → Funded → Accepted → Resolved
                          ↓           ↓
                      Disputed    Released / Refunded
                          ↓
                    Resolved (by evaluator)
```

### Instructions

1. **`initialize_task_escrow`** — Create PDA account, set hirer/worker/fees/deadline. Status → `Initialized`.
2. **`fund_escrow`** — Hirer transfers SOL to PDA. Status → `Funded`. Requires hirer signature.
3. **`accept_task`** — Worker confirms acceptance. Status → `Accepted`. Requires worker signature. Only from `Funded`.
4. **`release_payout`** — Release funds: worker gets payout, platform/runtime get fees. Status → `Released`. Requires hirer or evaluator authority. Only from `Accepted` or `Resolved`.
5. **`refund`** — Refund hirer. Status → `Refunded`. Requires hirer signature or deadline expiry. Only from `Funded` or `Accepted`.
6. **`open_dispute`** — Hirer or worker opens dispute. Status → `Disputed`. Requires hirer or worker signature. Only from `Accepted`.
7. **`resolve_dispute`** — Evaluator resolves dispute, decides release or refund. Status → `Resolved`. Requires evaluator authority. Only from `Disputed`.

### Error Codes

- `EscrowAlreadyFunded` — Attempt to fund twice
- `InvalidStatusTransition` — Instruction called from wrong status
- `UnauthorizedSigner` — Signer is not the required authority
- `DeadlineNotPassed` — Refund called before deadline without dispute
- `InsufficientFunds` — PDA has insufficient lamports for payout + fees
- `DisputeAlreadyOpen` — Attempt to open dispute twice
- `InvalidFeeConfiguration` — Fee bps exceed 10000 (100%)

## [S4] TypeScript Settlement Adapter

### Package: `packages/solana-client/`

Modules:

- **`adapter.ts`** — `SolanaSettlementAdapter` implements `SettlementAdapter` interface from `apps/api/src/adapters/settlement.ts`
- **`client.ts`** — `EscrowClient` wraps Anchor IDL calls: `initialize()`, `fund()`, `accept()`, `release()`, `refund()`, `openDispute()`, `resolveDispute()`
- **`config.ts`** — Configuration: `programId`, `rpcUrl`, `commitment`, `feeWallets`, `feeBps`
- **`idl/omniclaw_escrow.json`** — Anchor IDL generated from program build

### Interface Mapping

| Existing Method | Anchor Call | Notes |
|----------------|-------------|-------|
| `lockEscrow()` | `initialize` + `fund` | Two instructions, could be batched |
| `releasePayout()` | `release` | Program handles fee distribution internally |
| `refund()` | `refund` | Works for cancellation, rejection, expiration |
| `recordFailure()` | No chain call | Records to `settlement_events` table only |

### Idempotency

- `task_id` as PDA seed makes `initialize` naturally idempotent (account already exists = skip)
- All other instructions check on-chain status before submitting
- Failed tx signatures recorded in `settlement_events` for audit

### Environment Variables

```
OMNICLAW_SETTLEMENT_ADAPTER=solana_devnet
OMNICLAW_SOLANA_RPC_URL=https://api.devnet.solana.com
OMNICLAW_SOLANA_PROGRAM_ID=<deployed_program_id>
OMNICLAW_SOLANA_PLATFORM_FEE_WALLET=<wallet_address>
OMNICLAW_SOLANA_RUNTIME_FEE_WALLET=<wallet_address>
OMNICLAW_SOLANA_COMMITMENT=confirmed
```

## [S5] Directory Structure

```
programs/
  escrow/
    Anchor.toml
    Cargo.toml
    src/
      lib.rs
      state.rs
      instructions/
        mod.rs
        initialize.rs
        fund.rs
        accept.rs
        release.rs
        refund.rs
        open_dispute.rs
        resolve_dispute.rs
      errors.rs

packages/
  solana-client/
    package.json
    tsconfig.json
    src/
      index.ts
      adapter.ts
      client.ts
      config.ts
      idl/
        omniclaw_escrow.json
```

## [S6] Deployment Flow

1. `anchor build` — Compile the program
2. `anchor deploy --provider.cluster devnet` — Deploy to devnet
3. Record program ID to environment variables
4. Update `apps/api` config: `OMNICLAW_SETTLEMENT_ADAPTER=solana_devnet`

## [S7] Dependencies

- Rust: `anchor-lang` 0.30+
- TypeScript: `@coral-xyz/anchor`, `@solana/web3.js`

## [S8] Integration with Existing Code

- `apps/api/src/adapters/settlement.ts` — Add `SolanaSettlementAdapter` alongside `MockSettlementAdapter`
- `apps/api/src/config.ts` — Extend `SettlementConfig` with Solana-specific fields
- Config switch: `OMNICLAW_SETTLEMENT_ADAPTER=mock` (default) | `solana_devnet`
- No changes to `SettlementAdapter` interface itself

## [S9] Constraints

- Devnet only for this phase — no mainnet deployment
- SOL-only — no SPL token / USDC support
- No test suite in this phase
- On-chain state is minimal per ADR-0001 — payloads, manifests, artifacts stay offchain
- Dispute resolution requires evaluator authority — evaluator wallet configured via env var
