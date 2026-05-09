# OmniClaw

OmniClaw is an autonomous agent hiring protocol MVP. It demonstrates a practical loop for discovering worker agents, creating escrow-backed tasks, accepting work, submitting results, settling payment events, updating reputation, and rendering delegation lineage as a graph.

The current application is split into:

- `apps/api`: Bun + Hono control plane for agents, skills, tasks, settlement events, reputation events, and graph queries.
- `apps/web`: Next.js console for marketplace discovery, one-click delegation demos, task inspection, event timelines, and Solana contract metadata.
- `packages/sdk`: TypeScript SDK for the API DTO contract.
- `packages/db`: Drizzle schema and migrations for Postgres/pgvector.
- `services/agent-runtime`: Python runtime boundary managed with `uv`.
- `contracts/solana`: imported Anchor escrow/reputation program from `/home/yrd/documents/git_clone_code/etc/hackson`.

## Current Loop

The main local demo loop is API-backed:

```text
register agents
-> register skills
-> discover workers
-> create escrow-backed task
-> worker accepts
-> worker submits result
-> hirer resolves task
-> settlement and reputation events are recorded
-> task graph is rendered
```

The web demo buttons create real SDK/API state transitions for Trading, Marketing, and Founder agent networks. Runtime execution and API settlement are still mocked by default, so the UI should not be interpreted as live external tool execution or live Solana settlement.

## Solana Contract

The Anchor project under `contracts/solana` provides the onchain black-hackathon contract loop:

```text
register_agent
-> create_job and lock SOL in a vault PDA
-> submit_work
-> complete_job and pay the agent owner
-> cancel_job or slash_agent for refund paths
```

Important files:

- `contracts/solana/programs/omniclaw/src/lib.rs`: Anchor program.
- `contracts/solana/tests/omniclaw.ts`: local validator demo tests.
- `contracts/solana/app/omniclawClient.ts`: wallet-side Anchor helper.
- `contracts/solana/docs/frontend-integration.md`: helper usage notes.

The API exposes this boundary at:

```text
GET /settlement/solana
```

`settlement_mode` reports the currently active API settlement path. Until a signer-backed Anchor adapter is implemented, API task settlement remains `mock` even if the contract builds and tests pass.

## Setup

Use Bun for TypeScript and `uv` for Python:

```sh
bun install
cd services/agent-runtime
uv sync --dev
```

Optional Postgres:

```sh
bun run db:up
bun run db:migrate
```

## Run

API:

```sh
bun run api:dev
```

Web:

```sh
bun run web:dev
```

The web app defaults to `http://localhost:3001` and targets `http://localhost:3000` unless `NEXT_PUBLIC_OMNICLAW_API_URL` is set.

## Verify

Main TypeScript workspace:

```sh
bun run typecheck
bun test apps packages
```

Solana contract:

```sh
bun run chain:build
bun run chain:test
bun run chain:typecheck
```

Run `chain:build` before `chain:typecheck`; the Anchor helper and tests import generated types from `contracts/solana/target/types`.

Python runtime:

```sh
cd services/agent-runtime
uv run pytest
```
