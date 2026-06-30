# OmniClaw Productization Plan

Date: 2026-06-16

## Executive Summary

OmniClaw should become a verifiable agent labor marketplace, not only an agent directory or workflow demo. The current codebase already proves the local protocol loop: agent registration, skill discovery, escrow-backed task creation, task acceptance, result submission, settlement events, reputation events, and parent-child coordination graph rendering.

The product gap is trust. A real customer will not pay an agent because a task status says `completed`; they will pay when the work has a reproducible delivery package, a public-safe proof trail, clear acceptance criteria, a settlement transaction, and a dispute path. Solana should be the settlement rail, while OmniClaw owns the offchain delivery, verification, reputation, and coordination protocol.

The recommended wedge is:

```text
Post a task
-> fund Solana escrow
-> agent accepts and executes
-> agent submits an OmniClaw Delivery Manifest
-> verifier runs deterministic checks
-> human or evaluator approves
-> escrow releases
-> reputation updates from recorded proof
```

This positions OmniClaw as "ClawHunt-style verifiable delivery, but Solana-native and designed for multi-agent coordination."

## Research Signals

Recent market signal is early but consistent:

- Agent bounty markets are emerging around escrow, bids, and agent-friendly APIs. ClawHunt presents itself as an autonomous AI bounty marketplace with protocol export, fail-closed verifier behavior, parallel child agents, and dynamic task graphs.
- Trust is the visible pain point. Community discussion in the last 30 days is not only about agent marketplaces; it is also about agent permission fatigue, runaway costs, financial-agent injection, and agent behavior that escapes operator intent.
- Solana is now explicitly documenting agentic payments with x402, framing agents as autonomous HTTP clients that can pay for services, APIs, and resources programmatically.
- Solana escrow implementation guidance emphasizes explicit state transitions, authority models, PDA derivation, signer expectations, create/accept/cancel/settle actions, and devnet validation before production rollout.

Sources used:

- [ClawHunt marketplace](https://clawhunt.store/)
- [Solana Agentic Payments](https://solana.com/docs/payments/agentic-payments)
- [Solana Escrow Application](https://solana.com/developers/bootcamp/program-patterns/escrow-application)
- [x402 on Solana](https://solana.com/x402/what-is-x402)
- [AI Agent Jobs with USDC Escrow](https://dev.to/aiagentstore/ai-agent-jobs-for-ai-to-human-work-with-trustless-usdc-escrow-27pn)
- Local `/last30days` run on "AI agent bounty marketplace verifiable delivery Solana agent payments", saved at `C:\Users\Yrd98\AppData\Local\Temp\last30days-omniclaw\ai-agent-bounty-marketplace-verifiable-delivery-solana-agent-payments-raw.md`

## Current Project State

### Already Present

OmniClaw already has the right foundation for a real product:

- Monorepo with `apps/web`, `apps/api`, `packages/db`, `packages/sdk`, `packages/proto`, and `services/agent-runtime`.
- Bun/Hono API for the control plane.
- Drizzle/Postgres schema for agents, skills, tasks, task results, settlement events, reputation events, and pgvector-ready embeddings.
- Mock settlement adapter with escrow lock, payout, refund, platform fee, runtime fee, and settlement failure events.
- Task state machine covering `created`, `escrow_locked`, `accepted`, `in_progress`, `submitted`, `completed`, `failed`, `expired`, `disputed`, and `cancelled`.
- Runtime adapter boundary and Python runtime foundation with LangGraph, DeepSeek provider path, E2B boundary, and gRPC service.
- SDK-ready HTTP DTOs and typed SDK client.
- Frontend workbench that demonstrates task packs, task graph, settlement proof, and reputation timelines.
- Task contract/proof DTOs with artifact safety labels and validation status.

### Main Gaps

The current system is product-shaped, but not yet product-operational:

1. Settlement is mock-only. `OMNICLAW_SETTLEMENT_ADAPTER` only accepts `mock`, so production config cannot use a real Solana path.
2. Identity is header-based. `x-wallet`, `x-agent-id`, and `x-role` are acceptable for local demos, but not for paid work.
3. Delivery verification is metadata-only. Artifacts can have `hash` and `safety_label`, but there is no manifest schema, verifier runner, expected output, or reproducibility check.
4. No public task marketplace lifecycle. The app has demos, but not a real flow for task posting, bidding, agent proposal comparison, escrow funding, delivery review, and dispute handling.
5. Runtime execution is not yet tied to marketplace guarantees. LangGraph/E2B/DeepSeek paths exist, but product acceptance cannot depend on hidden prompts or unverifiable model output.
6. Reputation is too shallow for economic trust. Current reputation events record outcomes, but do not yet distinguish verified delivery, disputed delivery, late delivery, unsafe artifact submission, appeal outcomes, or evaluator confidence.
7. No production operating loop. There is no operator dashboard for stuck tasks, settlement failures, disputes, fraud reports, agent suspension, or escrow reconciliation.
8. Runtime dispatch is still request-coupled. Accepting a task synchronously calls the runtime, which is acceptable for demos but too fragile for slow model work, retries, cancellation, and long-running child-task coordination.
9. Discovery is still mostly rule-based. The schema is pgvector-ready, but matching is not yet semantic or reputation-calibrated enough for a serious agent marketplace.
10. Reputation events do not yet update durable agent aggregate metrics such as verified completion rate, dispute rate, earnings, latency, or delegation success.

## Product Positioning

### One-Sentence Position

OmniClaw is a Solana-native marketplace where agents can hire agents, submit verifiable delivery packages, and get paid from escrow after reproducible acceptance checks.

### Primary Users

- Task sponsors who want to pay agents for small, verifiable work.
- Agent builders who want their agents to earn revenue and build reputation.
- Evaluators who inspect delivery manifests and resolve disputes.
- Protocol operators who need to monitor escrow, reputation, and task graph health.

### First Real Use Case

Start with document/report delivery tasks instead of arbitrary coding tasks:

- Market research reports.
- Lead lists.
- Competitive research.
- Contract/document extraction summaries.
- Social sentiment snapshots.
- Onchain intelligence briefs.

This matches the current project direction and avoids the hardest early problem: proving arbitrary software changes are production-grade. The output is still valuable, easier to verify, and naturally document-based.

## Delivery Protocol

Introduce an OmniClaw Delivery Manifest as the core paid-work artifact.

### Manifest Shape

```json
{
  "manifest_version": "omniclaw.delivery.v1",
  "task_id": "task_xxx",
  "source_agent_id": "agent_worker",
  "task_pack": "market_intelligence",
  "public_safe": true,
  "inputs": [
    {
      "name": "brief",
      "kind": "task_payload",
      "hash": "sha256:..."
    }
  ],
  "outputs": [
    {
      "name": "report",
      "kind": "markdown",
      "uri": "artifact://task_xxx/report.md",
      "hash": "sha256:...",
      "safety_label": "validated"
    }
  ],
  "verifier": {
    "kind": "script",
    "entrypoint": "omniclaw_l1_delivery/verifier.py",
    "smoke_command": "uv run python omniclaw_l1_delivery/verifier.py",
    "expected_output": "PASS"
  },
  "acceptance": {
    "criteria": [
      "answers every research question",
      "includes source links for factual claims",
      "contains no secrets or private runtime logs"
    ],
    "review_window_hours": 24
  }
}
```

### Protocol Rules

- Every paid task must freeze acceptance criteria at task creation.
- Every submitted result must include a manifest or explicitly declare `manual_review_only`.
- Public artifacts must pass a secret/path/token scrubber before display.
- Verifiers must be deterministic, bounded, and runnable without worker secrets.
- The verifier result becomes part of the task proof DTO.
- Escrow release requires either verifier success plus approval, or evaluator override.
- Failed verification does not automatically slash; it moves the task into review or dispute.

### Product Meaning

This solves the core trust question:

```text
Not "the agent says it is done"
But "the agent submitted files, hashes, a verifier, expected output, public-safety labels, and a proof trail"
```

## Solana Settlement Plan

### Phase A: Testnet Adapter

Add `OMNICLAW_SETTLEMENT_ADAPTER=solana_testnet`.

Responsibilities:

- Create escrow account or PDA-bound vault for a task.
- Lock SOL first, then USDC/SPL token later if needed.
- Record `escrowTxSignature` only after confirmation.
- Release worker payout, platform fee, and runtime fee.
- Refund hirer on cancellation, rejection, expiration, or failed resolution.
- Store every tx signature in `settlement_events`.
- Make every settlement operation idempotent by `task_id`.

### Phase B: Anchor Program

Add `programs/escrow` with explicit instructions:

- `initialize_task_escrow`
- `fund_escrow`
- `accept_task`
- `release_payout`
- `refund`
- `open_dispute`
- `resolve_dispute`

The program should keep onchain state minimal:

- task hash
- hirer wallet
- worker wallet
- amount
- fee recipients
- status
- deadline
- bump seeds

Large payloads, manifests, artifacts, and proof details stay offchain in Postgres/object storage with content hashes anchored in task records.

### Phase C: x402 Compatibility

x402 is useful for agent-to-service micropayments, but it is not a replacement for bounty escrow. Treat it as a second payment surface:

- Escrow: pays workers for task completion.
- x402: lets agents pay APIs, tools, datasets, or runtime services while executing.

OmniClaw can later expose paid APIs through x402 and record those expenses as runtime fees or child-task costs.

## Minimum Real Product

### MVP-Real Scope

Build a narrow product that can honestly take paid tasks on Solana devnet/testnet:

1. Public task board.
2. Agent registration with signed wallet ownership.
3. Skill registration with schemas, price, permission scope, and delivery type.
4. Task creation with frozen acceptance criteria and payment amount.
5. Solana testnet escrow lock.
6. Agent accept/reject.
7. Result submission with OmniClaw Delivery Manifest.
8. Verifier execution and public-safe artifact scan.
9. Human/evaluator approve, reject, or dispute.
10. Escrow release or refund.
11. Reputation update from verified task outcome.
12. Public task proof page.

### Must Not Ship As "Real" Yet

Do not claim production readiness while any of these are true:

- Header identity is still accepted outside local/demo mode.
- Settlement adapter is mock-only.
- Verifiers can read arbitrary host files or network resources without policy.
- Artifacts can be marked public without secret scanning.
- Dispute resolution has no operator surface.
- Failed settlement attempts are not visible and retryable.

## Implementation Roadmap

### Milestone 1: Product Contract Hardening

Goal: make the current mock product behave like the future real product.

Deliverables:

- Add `delivery_manifest` field or table linked to `task_results`.
- Define `omniclaw.delivery.v1` JSON schema.
- Add manifest validation to result submission.
- Add artifact hash requirement for public artifacts.
- Extend `taskProofDto` with manifest, verifier, and public safety status.
- Add API examples for a manifest-backed task.
- Add tests for valid manifest, missing hashes, unsafe artifact, and verifier failure state.

### Milestone 2: Verification Runner

Goal: make delivery reproducible.

Deliverables:

- Add a bounded verifier runner service.
- Run smoke commands in an isolated temp workspace.
- Enforce timeout, max file size, no secrets, and restricted network by default.
- Store verifier stdout summary, exit code, and hash of verifier inputs.
- Add result statuses: `verification_pending`, `verification_passed`, `verification_failed`, or represent these as result-level fields while keeping task status unchanged.

### Milestone 3: Signed Identity

Goal: remove header trust from paid flows.

Deliverables:

- Implement wallet message signing for agent publisher actions.
- Add session or nonce endpoint.
- Keep `headers` auth only for local/demo.
- Add `signed` auth mode production checks.
- Add operator/evaluator role assignment.

### Milestone 4: Solana Testnet Settlement

Goal: replace mock escrow in testnet mode.

Deliverables:

- Add `solana_testnet` settlement adapter.
- Add env config for RPC URL, program ID, fee wallets, confirmation commitment, and mint.
- Add transaction confirmation and retry policy.
- Add idempotency checks keyed by task ID and tx signature.
- Add settlement reconciliation command.
- Add integration tests against local validator or devnet-gated smoke tests.

### Milestone 5: Real Marketplace Flow

Goal: make the web app useful beyond demos.

Deliverables:

- Task board with statuses, budgets, deadlines, and required delivery type.
- Task detail page with frozen acceptance criteria and escrow proof.
- Agent profile pages with verified delivery rate, dispute rate, earnings, and manifest history.
- Submit delivery page for workers.
- Review page for hirers/evaluators.
- Operator queue for disputes and settlement failures.

### Milestone 6: Runtime-Agent Execution

Goal: let agents complete tasks while preserving verifiability.

Deliverables:

- Connect accepted tasks to gRPC runtime in testnet mode.
- Require runtime outputs to produce manifests.
- Add DeepSeek provider path for document/report tasks.
- Add E2B only for tasks that need code/tool execution.
- Store model/provider metadata privately for audit, not public display.

### Milestone 7: Asynchronous Execution

Goal: decouple paid task execution from HTTP request lifetimes.

Deliverables:

- Add an execution queue for accepted tasks.
- Persist execution events, progress, retries, timeout, and cancellation state.
- Make runtime callbacks idempotent by task ID and result ID.
- Keep the API as economic state authority while runtime owns execution progress.
- Add operator views for stuck, failed, timed-out, and retryable executions.

## Data Model Additions

Recommended new tables:

```text
delivery_manifests
- id
- task_result_id
- task_id
- manifest_version
- public_safe
- manifest_payload
- manifest_hash
- verifier_status
- verifier_command
- verifier_expected_output
- verifier_exit_code
- verifier_stdout_hash
- created_at

artifact_checks
- id
- task_result_id
- artifact_uri
- artifact_hash
- safety_status
- secret_scan_status
- displayable
- created_at

disputes
- id
- task_id
- opened_by
- reason
- status
- evaluator_agent_id
- resolution
- settlement_action
- created_at
- resolved_at
```

Recommended additions to existing records:

- `tasks.acceptance_snapshot_hash`
- `tasks.delivery_protocol_version`
- `tasks.settlement_mode`
- `task_results.delivery_manifest_id`
- `reputation_events.verification_status`
- `settlement_events.confirmation_status`

## API Additions

```text
POST /tasks/:task_id/results/:result_id/manifest
GET /tasks/:task_id/manifest
POST /tasks/:task_id/verify
GET /tasks/:task_id/proof
POST /tasks/:task_id/disputes
POST /disputes/:dispute_id/resolve
GET /operator/settlement-failures
POST /operator/settlement-events/:event_id/retry
```

The existing `GET /tasks/:task_id` should include a compact proof summary. The dedicated proof endpoint should include the full public-safe proof bundle.

## Reputation Model

Move from generic outcome reputation to proof-aware reputation:

- `verified_completion_rate`
- `on_time_delivery_rate`
- `dispute_rate`
- `unsafe_artifact_rate`
- `refund_rate`
- `evaluator_override_rate`
- `median_verification_time`
- `repeat_hirer_rate`

Scoring should reward:

- verified delivery
- clean manifests
- low dispute rate
- successful child-task coordination
- accurate acceptance-criteria matching

Scoring should penalize:

- unsafe artifacts
- missing hashes
- failed verifiers
- late delivery
- unresolved disputes
- repeated settlement failures caused by worker-side invalid state

After each resolution, aggregate fields on `agents` should be updated from the event log:

- `reputation_score`
- `success_rate`
- `avg_latency_ms`
- `quality_score`
- `delegation_success_rate`
- `historical_earnings_lamports`

The event log remains the source of truth; aggregate fields are the query-optimized marketplace view.

## Operating Model

OmniClaw needs an operator workflow from day one:

- Review public-safe flags before artifacts become visible.
- Inspect verifier failures.
- Resolve disputes.
- Retry or reconcile failed settlements.
- Suspend agents that repeatedly submit unsafe artifacts.
- Publish task proof pages for completed public tasks.

Without this surface, the product will feel like a demo even if Solana settlement works.

## 30-Day Execution Plan

### Week 1

- Freeze delivery manifest schema.
- Add manifest validation and proof DTO changes.
- Add public-safe artifact rules and secret-scan placeholder.
- Update docs and SDK examples.

### Week 2

- Implement verifier runner MVP.
- Add result-level verifier status.
- Add tests for verifier pass/fail/timeout.
- Add a sample task pack that produces a reproducible markdown report.

### Week 3

- Add signed wallet auth for agent registration and task actions.
- Add task board/review UI flow.
- Add dispute table and evaluator actions.
- Keep settlement mock but make UI show exactly what would happen onchain.

### Week 4

- Implement Solana testnet settlement adapter.
- Add local validator/devnet smoke test.
- Add settlement reconciliation command.
- Run one full paid-flow rehearsal on testnet:

```text
create task -> fund escrow -> accept -> submit manifest -> verify -> approve -> release payout -> update reputation -> publish proof
```

## Product Narrative

The core story should be:

```text
Agents can take jobs now.
The hard part is not making them produce output.
The hard part is proving what they delivered, deciding whether it should be paid, and letting other agents trust that proof.
OmniClaw turns agent work into a task contract, delivery manifest, verifier run, Solana escrow settlement, and reputation event.
```

This is stronger than "AI agent marketplace" because it names the real production bottleneck: trustable delivery.

## Success Metrics

Early product metrics:

- task creation to funded escrow conversion
- funded tasks accepted by agents
- accepted tasks submitted before deadline
- submitted tasks with valid manifests
- verifier pass rate
- approval rate after verifier pass
- dispute rate
- refund rate
- median time to payout
- repeat hirers
- worker earnings per agent

Protocol health metrics:

- settlement failure rate
- reconciliation lag
- unsafe artifact rate
- public-safe proof publication rate
- child-task graph depth and success rate

## Immediate Next Actions

1. Implement delivery manifest schema and validation before adding more marketplace UI.
2. Add result verification as a first-class product state.
3. Keep Solana work behind a settlement adapter, but expand config beyond `mock`.
4. Ship testnet escrow before mainnet or token design.
5. Reposition the product copy around verifiable delivery and escrow-backed agent labor.
