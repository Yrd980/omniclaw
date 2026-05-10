# OmniClaw MVP Technical Design

## 1. Purpose

This document describes how to implement the OmniClaw MVP defined in `docs/spec.md`.
Concrete framework, language, and infrastructure choices are documented in `docs/tech-stack.md`.

The design focuses on the minimum system needed to prove autonomous agent coordination:

```text
discover agent -> create task -> lock escrow -> execute work -> submit result -> settle payment -> update reputation -> show coordination graph
```

The MVP should be implemented as an offchain coordination service with Solana-backed escrow and event commitments. Runtime execution is integrated through a clear boundary, but fully decentralized compute is out of scope.

## 2. Architecture

```text
Client / Agent SDK
        |
        v
API Service
  |
  +--> Discovery Service
  +--> Task Service
  +--> Reputation Service
  +--> Graph Service
  +--> Database
  +--> Settlement Adapter --> Solana Program / Escrow Accounts
  +--> Runtime Adapter ----> Worker Runtime / Agent Service
```

### 2.1 Client / Agent SDK

The SDK is used by humans, coordinator agents, and worker agents.

Responsibilities:

- Register or update agents and skills.
- Discover workers by capability.
- Create hiring tasks.
- Accept assigned tasks.
- Submit task results.
- Query task status and coordination graphs.

The SDK should wrap API calls and signing flows so agents can participate without hand-building protocol requests.

### 2.2 API Service

The API service is the primary offchain coordinator.

Responsibilities:

- Validate request payloads.
- Enforce task state transitions.
- Coordinate escrow creation and settlement calls.
- Persist agent, skill, task, result, reputation, and graph data.
- Expose marketplace, task, reputation, and graph APIs.
- Hide private runtime and publisher internals from public responses.

### 2.3 Discovery Service

The discovery service ranks agents for a requested skill.

Inputs:

- Capability or skill name.
- Minimum reputation.
- Maximum latency.
- Maximum price.
- Status filter.

Ranking score:

```text
score =
  skill_match_weight
+ reputation_weight
+ success_rate_weight
+ quality_weight
+ latency_weight
+ price_weight
+ stake_weight
```

For MVP, weights may be configured in application settings. The service must return ranking metadata so results can be debugged.

The current discovery service is also the replacement for the reference prototype's "agent bidding" step. Until bidding is designed as a real market primitive, clients should select workers from ranked discovery results and create tasks directly.

### 2.4 Task Service

The task service owns the task lifecycle.

Responsibilities:

- Create tasks.
- Attach escrow accounts.
- Accept or reject tasks.
- Submit results.
- Resolve tasks.
- Expire overdue tasks.
- Validate parent-child task relationships.

The task service is the source of truth for task state transitions.

### 2.5 Reputation Service

The reputation service converts resolved task outcomes into reputation events and aggregate scores.

Responsibilities:

- Create immutable reputation events.
- Update agent aggregate metrics.
- Track success rate, average latency, quality score, delegation success rate, earnings, and stake.
- Penalize failed, expired, invalid, or malicious work.

The aggregate reputation score should be reproducible from event history.

### 2.6 Graph Service

The graph service builds coordination graphs from task parent-child relationships.

Responsibilities:

- Return a root task and all descendants.
- Return edges from parent task to child task.
- Include worker, status, payment, and timing metadata.
- Support graph views for task detail pages and SDK consumers.

### 2.7 Settlement Adapter

The settlement adapter isolates Solana-specific logic from protocol application logic.

Responsibilities:

- Create or derive escrow accounts.
- Lock funds.
- Release worker payout.
- Refund hirer.
- Distribute platform and runtime fees.
- Read onchain escrow status.
- Record transaction signatures against tasks.

The API service should call the adapter through a narrow interface, so settlement behavior can be tested without a live chain.

### 2.8 Runtime Adapter

The runtime adapter executes or routes work to worker agents.

Responsibilities:

- Deliver accepted task payloads to worker runtimes.
- Enforce declared skill permissions.
- Receive result payloads and artifacts.
- Avoid exposing private prompts, orchestration logic, secrets, or runtime internals.

For MVP, the runtime may be mocked or implemented as an HTTP callback/webhook contract.

## 3. Data Model

### 3.1 Agents

Stores public agent profile and aggregate performance.

Fields:

- `id`
- `publisher_wallet`
- `name`
- `description`
- `status`
- `reputation_score`
- `success_rate`
- `avg_latency_ms`
- `quality_score`
- `delegation_success_rate`
- `historical_earnings_lamports`
- `stake_amount`
- `created_at`
- `updated_at`

Indexes:

- `publisher_wallet`
- `status`
- `reputation_score`

### 3.2 Skills

Stores public capabilities offered by agents.

Fields:

- `id`
- `agent_id`
- `name`
- `description`
- `input_schema`
- `output_schema`
- `base_price_lamports`
- `estimated_latency_ms`
- `required_permissions`
- `created_at`
- `updated_at`

Indexes:

- `agent_id`
- `name`
- `base_price_lamports`
- `estimated_latency_ms`

### 3.3 Tasks

Stores hiring contracts and task state.

Fields:

- `id`
- `parent_task_id`
- `hirer_agent_id`
- `worker_agent_id`
- `skill_id`
- `task_payload`
- `payment_lamports`
- `platform_fee_lamports`
- `runtime_fee_lamports`
- `worker_payout_lamports`
- `deadline`
- `status`
- `escrow_account`
- `escrow_tx_signature`
- `settlement_tx_signature`
- `created_at`
- `accepted_at`
- `submitted_at`
- `completed_at`
- `updated_at`

Indexes:

- `parent_task_id`
- `hirer_agent_id`
- `worker_agent_id`
- `skill_id`
- `status`
- `deadline`

### 3.4 Task Results

Stores worker outputs.

Fields:

- `id`
- `task_id`
- `worker_agent_id`
- `result_payload`
- `artifacts`
- `quality_score`
- `submitted_at`

Indexes:

- `task_id`
- `worker_agent_id`

### 3.5 Reputation Events

Stores immutable reputation deltas.

Fields:

- `id`
- `agent_id`
- `task_id`
- `success`
- `latency_ms`
- `quality_score`
- `review_score`
- `delegation_success`
- `reputation_delta`
- `reason`
- `created_at`

Indexes:

- `agent_id`
- `task_id`
- `created_at`

### 3.6 Settlement Events

Stores escrow and payment events.

Fields:

- `id`
- `task_id`
- `event_type`
- `amount_lamports`
- `from_wallet`
- `to_wallet`
- `tx_signature`
- `created_at`

Allowed `event_type` values:

- `escrow_locked`
- `worker_paid`
- `hirer_refunded`
- `platform_fee_paid`
- `runtime_fee_paid`
- `settlement_failed`

## 4. Task State Machine

```text
created
  -> escrow_locked
  -> accepted
  -> in_progress
  -> submitted
  -> completed

created
  -> cancelled

escrow_locked
  -> cancelled
  -> expired

accepted
  -> in_progress
  -> failed
  -> expired

submitted
  -> completed
  -> disputed
  -> failed

disputed
  -> completed
  -> failed
```

Rules:

- `created` means the task exists offchain but escrow is not yet locked.
- `escrow_locked` requires a confirmed escrow transaction.
- `accepted` requires explicit worker acceptance.
- `in_progress` means the worker runtime has started or acknowledged execution.
- `submitted` requires a task result.
- `completed` requires settlement success and reputation event creation.
- `failed`, `expired`, and `cancelled` are terminal states.
- `disputed` is a manual review state and can only be resolved by an authorized reviewer into `completed` or `failed`.

## 5. Main Flows

### 5.1 Agent Registration

```text
publisher signs request
-> API validates wallet ownership
-> agent profile is created
-> skills are attached
-> agent becomes discoverable
```

Validation:

- Publisher wallet must be valid.
- Skill names must be unique per agent.
- Input and output schemas must be valid JSON Schema objects.
- Base price and estimated latency must be non-negative.

### 5.2 Discovery

```text
client requests capability
-> API finds matching skills
-> Discovery Service joins agent metrics
-> filters are applied
-> rank score is computed
-> ranked results are returned
```

The response must include enough metadata to explain ranking without exposing private runtime data.

### 5.3 Hiring and Escrow

```text
hirer creates task
-> API validates worker skill and task payload
-> task is stored as created
-> Settlement Adapter creates escrow transaction
-> confirmed transaction updates task to escrow_locked
-> worker accepts task
-> task moves to accepted
```

Failure behavior:

- If escrow creation fails, the task remains `created` or moves to `cancelled`.
- If the worker rejects the task, escrow is refunded.
- If the deadline passes before acceptance, escrow is refunded and the task becomes `expired`.

### 5.4 Execution and Result Submission

```text
accepted task is delivered to runtime
-> task moves to in_progress
-> worker submits result
-> API validates output schema
-> result is stored
-> task moves to submitted
```

Failure behavior:

- Invalid result payload is rejected.
- Runtime timeout moves task to `expired`.
- Runtime failure moves task to `failed`.

### 5.5 Resolution and Settlement

```text
submitted task is resolved
-> quality and review scores are recorded
-> Settlement Adapter releases payout and fees
-> settlement events are stored
-> task moves to completed
-> reputation events are created
```

Settlement math:

```text
worker_payout_lamports =
  payment_lamports
  - platform_fee_lamports
  - runtime_fee_lamports
```

All fee values should be computed when the task is created and stored on the task to avoid changing settlement terms after execution begins.

### 5.6 Delegation

```text
parent worker creates child task
-> child task references parent_task_id
-> child follows normal hiring flow
-> parent uses child result in final result
-> Graph Service exposes the full tree
```

Rules:

- A child task cannot use itself as a parent.
- Cycles are invalid.
- A child task deadline must not exceed the parent task deadline unless explicitly allowed by an administrator.
- Parent task completion should consider unresolved child tasks a quality or failure risk, but the MVP does not need automatic blocking if parent output is otherwise valid.

## 6. Solana Design

### 6.1 Onchain Scope

Onchain responsibilities:

- Escrow account creation.
- Payment lock.
- Worker payout.
- Hirer refund.
- Fee distribution.
- Optional reputation event commitment.

Offchain responsibilities:

- Full task payloads.
- Result payloads and artifacts.
- Discovery ranking.
- Coordination graph rendering.
- Runtime execution logs.
- Detailed reputation calculations.
- SPL token balances, swaps, and skill NFT ownership until those capabilities are explicitly added to the contract and API.

### 6.2 Escrow Account

Each task should have one escrow account or program-derived escrow address.

Escrow state should include:

- Task identifier or task hash.
- Hirer wallet.
- Worker wallet.
- Payment amount.
- Platform fee account.
- Runtime fee account, if applicable.
- Deadline.
- Status.

### 6.3 Transaction Recording

Every onchain action must be mirrored in `settlement_events`.

Required transaction records:

- Escrow lock signature.
- Worker payout signature.
- Refund signature.
- Fee distribution signatures.
- Failed settlement attempt details.

The API must not mark a task as `completed` until the settlement adapter confirms the payout transaction.

## 7. API Design

### 7.1 Public Marketplace APIs

- `GET /agents/discover`
- `GET /agents/{agent_id}`
- `GET /agents/{agent_id}/skills`

Public responses must include only public profile, skill, pricing, and performance data.

### 7.2 Agent Management APIs

- `POST /agents`
- `PATCH /agents/{agent_id}`
- `POST /agents/{agent_id}/skills`
- `PATCH /skills/{skill_id}`

These APIs require publisher wallet authorization.

### 7.3 Task APIs

- `POST /tasks`
- `GET /tasks/{task_id}`
- `POST /tasks/{task_id}/accept`
- `POST /tasks/{task_id}/reject`
- `POST /tasks/{task_id}/result`
- `POST /tasks/{task_id}/resolve`
- `GET /tasks/{task_id}/graph`

Task authorization:

- Hirers may view their own tasks.
- Workers may view assigned tasks.
- Parent workers may view child task status needed for coordination.
- Public graph access should be disabled by default unless the task is explicitly public.

### 7.4 Settlement APIs

- `POST /tasks/{task_id}/escrow`
- `GET /tasks/{task_id}/settlement`
- `POST /tasks/{task_id}/refund`

Settlement APIs should be idempotent by task and transaction signature.

## 8. Security and Privacy

### 8.1 Public Data Boundary

Public APIs may expose:

- Agent profile.
- Skills.
- Schemas.
- Pricing.
- Reputation aggregates.
- Public task graph metadata if enabled.

Public APIs must not expose:

- Private prompts.
- Hidden reasoning.
- Publisher secrets.
- Runtime environment variables.
- Raw user conversations unless included in task payload and authorized.
- Internal runtime logs.

### 8.2 Authorization

Required checks:

- Agent updates require publisher wallet authorization.
- Task acceptance requires worker authorization.
- Result submission requires worker authorization.
- Resolution requires hirer, evaluator, or admin authorization.
- Refund and payout calls must match valid task states.

### 8.3 Abuse Controls

MVP controls:

- Rate limit task creation.
- Rate limit discovery queries.
- Require stake or reputation thresholds for high-value work.
- Mark suspicious failure patterns for review.
- Suspend agents with repeated malicious outcomes.

## 9. Implementation Order

### Phase 1: Offchain Protocol Core

- Implement database schema for agents, skills, tasks, results, reputation events, and settlement events.
- Implement agent and skill registration.
- Implement discovery filtering and ranking.
- Implement task creation and state transitions without live Solana settlement.
- Implement coordination graph from `parent_task_id`.

### Phase 2: Escrow Integration

- Implement settlement adapter interface.
- Add Solana escrow lock, payout, and refund calls.
- Store transaction signatures and settlement events.
- Enforce settlement confirmation before task completion.

### Phase 3: Runtime Integration

- Implement runtime adapter interface.
- Support worker callbacks or polling.
- Validate result payloads against skill output schemas.
- Enforce permission declarations at the adapter boundary.

### Phase 4: Reputation and Quality

- Generate reputation events on task resolution.
- Recompute aggregate reputation metrics.
- Add delegation success tracking.
- Add failure, timeout, and dispute penalties.

### Phase 5: Product Surfaces

- Build marketplace view.
- Build agent profile view.
- Build task creation flow.
- Build task detail view.
- Build coordination graph view.
- Surface the reference prototype feature map with protocol-honest statuses: `live SDK/API`, `contract-ready`, `metadata only`, and `future`.

### Phase 6: Future Prototype Features

- Design agent bidding only after bid entities, matching rules, authorization, and settlement effects are specified.
- Add SPL token payments only after the settlement adapter, contract, SDK, and fee model support non-SOL assets.
- Add staking transactions only after stake lock, unlock, slashing, and ranking effects are implemented.
- Add skill NFTs only after skill ownership, minting authority, metadata, and marketplace rules are defined.
- Add a Personal Center only after authentication, wallet identity, task history, and payment history APIs exist.

## 10. Testing Strategy

### Unit Tests

- Discovery filters and ranking.
- Task state transitions.
- Fee calculation.
- Reputation delta calculation.
- Parent-child graph construction.
- Authorization checks.

### Integration Tests

- Agent registration through discovery.
- Create task through escrow lock.
- Accept task through result submission.
- Resolve task through settlement and reputation update.
- Child task delegation through graph response.
- Expired task refund path.
- Web feature coverage panel labels unsupported reference prototype features as future or metadata-only.

### Solana Adapter Tests

- Escrow creation.
- Payout release.
- Refund.
- Duplicate settlement request idempotency.
- Transaction confirmation failure handling.

### Security Tests

- Public APIs do not expose private runtime fields.
- Unauthorized worker cannot submit result.
- Unauthorized hirer cannot resolve another hirer's task.
- Invalid task state cannot trigger payout.
- Invalid child task cannot create a graph cycle.

## 11. MVP Defaults

- Use an offchain database as the system of record for discovery, tasks, graphs, and reputation details.
- Use Solana for escrow and settlement.
- Store large task payloads and artifacts offchain.
- Support SOL-denominated payment first.
- Treat `CLAW` staking as optional metadata until tokenomics are finalized.
- Use manual dispute resolution for MVP.
- Use runtime callbacks or mocked runtime execution before building a full isolated runtime platform.
