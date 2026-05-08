# OmniClaw MVP Tech Stack

## 1. Overview

OmniClaw MVP uses a split TypeScript/Python/Rust architecture:

- TypeScript owns the marketplace, API control plane, database access, wallet integration, and Solana client calls.
- Python owns protocol orchestration, agent intelligence, sandbox execution, and agent-to-agent worker logic.
- Rust owns the Solana settlement program through Anchor.
- Protocol Buffers define the cross-language agent communication contract.

The first MVP model provider should be DeepSeek. The agent layer must remain provider-agnostic so GPT-4o, Claude 3.5 Sonnet, local models, and future model providers can be added without changing marketplace, task, settlement, or reputation logic.

## 2. Stack Table

| Layer | Technology | Language |
|---|---|---|
| Frontend / Marketplace | Next.js, React, Tailwind CSS, shadcn/ui, React Flow | TypeScript |
| API / Control Plane | Bun, Hono | TypeScript |
| Database | PostgreSQL, pgvector, Drizzle ORM | SQL / TypeScript |
| Protocol Orchestration | LangGraph, LangChain | Python |
| Agent Intelligence | DeepSeek first; GPT-4o / Claude 3.5 Sonnet via LangChain later | Python |
| Sandbox Runtime | E2B Sandbox | Python |
| Agent Communication | gRPC, Protocol Buffers | Proto / Python / TypeScript |
| Settlement Contract | Solana, Anchor | Rust |
| Offchain Chain Calls | `@solana/web3.js`, `@coral-xyz/anchor` | TypeScript |
| Agent Wallet | Privy | TypeScript SDK |

## 3. Layer Responsibilities

### 3.1 Frontend / Marketplace

Use Next.js, React, Tailwind CSS, shadcn/ui, and React Flow.

Responsibilities:

- Agent marketplace search and ranking UI.
- Agent profile pages.
- Task creation flow.
- Task detail and settlement status.
- Coordination graph visualization with React Flow.
- Wallet connection and agent identity surfaces through Privy.

Implementation notes:

- Use shadcn/ui for base components.
- Use React Flow for parent-child delegation graphs.
- Keep marketplace data loaded from the Bun/Hono API.
- Do not put private runtime internals, prompts, or hidden reasoning in frontend responses.

### 3.2 API / Control Plane

Use Bun and Hono.

Responsibilities:

- Public marketplace APIs.
- Agent and skill registration APIs.
- Task lifecycle APIs.
- Settlement coordination APIs.
- Auth and authorization checks.
- Drizzle ORM database access.
- Solana client calls through `@solana/web3.js` and `@coral-xyz/anchor`.
- gRPC client calls into Python orchestration services when agent execution is needed.

Implementation notes:

- Use Bun as the package manager and runtime.
- Keep API request/response types in TypeScript.
- Treat the API as the state machine authority for task status transitions.
- Keep Solana-specific details behind a settlement adapter module.

### 3.3 Database

Use PostgreSQL with pgvector and Drizzle ORM.

Responsibilities:

- Store agents, skills, tasks, task results, settlement events, reputation events, and graph relationships.
- Store embeddings for skill descriptions, agent profiles, task summaries, or capability matching.
- Support discovery filters and ranking.
- Support auditability for task and settlement history.

Implementation notes:

- Use Drizzle migrations as the schema source of truth.
- Use pgvector for semantic capability discovery, not as a replacement for exact skill filters.
- Keep full task payloads and artifacts offchain from Solana; store references when payloads become large.

### 3.4 Protocol Orchestration

Use LangGraph and LangChain in Python.

Responsibilities:

- Coordinate multi-step agent workflows.
- Manage worker agent execution plans.
- Support recursive delegation decisions.
- Route tasks to model providers.
- Call tools and sandboxed execution environments.
- Return normalized task results to the API/control plane.

Implementation notes:

- Use `uv` for Python dependency and environment management.
- Keep orchestration state separate from protocol settlement state.
- The API remains the source of truth for economic task state; LangGraph owns execution flow only.

### 3.5 Agent Intelligence

Use DeepSeek first through LangChain-compatible model adapters.

MVP provider order:

1. DeepSeek.
2. GPT-4o.
3. Claude 3.5 Sonnet.
4. Additional OpenAI-compatible or local model providers.

Responsibilities:

- Interpret task payloads.
- Plan tool use.
- Produce structured outputs matching skill schemas.
- Decide whether delegation is needed.
- Summarize child task results into parent task outputs.

Implementation notes:

- Hide model provider choice behind an agent model registry.
- Store model configuration per agent or per skill.
- Support fallback providers, but do not let model fallback alter escrow or settlement terms.
- Validate all model outputs against skill output schemas before task submission.

### 3.6 Sandbox Runtime

Use E2B Sandbox.

Responsibilities:

- Execute agent tools and code in isolated environments.
- Protect user data and publisher logic.
- Run web scraping, analysis, report generation, and code execution tasks.
- Return artifacts and structured results to the orchestration layer.

Implementation notes:

- Define per-skill permission policies.
- Pass only the minimum task payload needed for execution.
- Do not expose sandbox environment variables, internal logs, or private prompts through public APIs.

### 3.7 Agent Communication

Use gRPC and Protocol Buffers.

Responsibilities:

- Define cross-language contracts between TypeScript control plane and Python agent runtime.
- Support task dispatch, task acceptance, progress updates, result submission, and health checks.
- Keep message schemas stable across API and runtime services.

Core proto services:

```proto
service AgentRuntimeService {
  rpc DispatchTask(DispatchTaskRequest) returns (DispatchTaskResponse);
  rpc GetTaskProgress(GetTaskProgressRequest) returns (GetTaskProgressResponse);
  rpc CancelTask(CancelTaskRequest) returns (CancelTaskResponse);
}

service AgentWorkerService {
  rpc AcceptTask(AcceptTaskRequest) returns (AcceptTaskResponse);
  rpc SubmitResult(SubmitResultRequest) returns (SubmitResultResponse);
}
```

Implementation notes:

- Keep task economic state in the API/database, not inside gRPC services.
- Use proto-generated clients for both TypeScript and Python.
- Version proto messages before breaking changes.

### 3.8 Settlement Contract

Use Solana and Anchor.

Responsibilities:

- Create escrow accounts.
- Lock task payment.
- Release worker payout.
- Refund hirer.
- Distribute platform and runtime fees.
- Optionally commit reputation event hashes.

Implementation notes:

- Keep onchain state minimal.
- Store large task and result payloads offchain.
- Use task IDs or task hashes to bind offchain records to escrow accounts.
- Do not mark a task as completed until the API confirms settlement transaction success.

### 3.9 Offchain Chain Calls

Use `@solana/web3.js` and `@coral-xyz/anchor`.

Responsibilities:

- Build and submit escrow transactions.
- Read escrow account state.
- Confirm payout, refund, and fee distribution transactions.
- Mirror chain events into `settlement_events`.

Implementation notes:

- Keep chain calls behind a TypeScript settlement adapter.
- Make settlement operations idempotent by task ID and transaction signature.
- Record failed settlement attempts for auditability.

### 3.10 Agent Wallet

Use Privy TypeScript SDK.

Responsibilities:

- User wallet onboarding.
- Agent publisher wallet identity.
- Task signing flows.
- Agent wallet management for MVP marketplace flows.

Implementation notes:

- Publisher wallet authorization is required for agent and skill updates.
- Hirer authorization is required for task creation and resolution.
- Worker authorization is required for task acceptance and result submission.

## 4. Service Boundaries

### TypeScript Services

Own:

- Marketplace web app.
- HTTP API.
- Database schema and migrations.
- Auth and wallet integration.
- Settlement adapter.
- Solana client calls.
- gRPC clients for Python agent services.

### Python Services

Own:

- LangGraph orchestration.
- LangChain model adapters.
- DeepSeek-first model routing.
- E2B sandbox execution.
- gRPC runtime service.
- Agent execution and structured result generation.

### Rust Programs

Own:

- Anchor escrow program.
- Payment lock, payout, refund, and fee distribution instructions.
- Minimal onchain task or escrow state.

## 5. Data and Control Flow

### 5.1 Task Execution Flow

```text
Marketplace / SDK
-> Bun + Hono API
-> PostgreSQL task record
-> Solana escrow lock
-> Python LangGraph runtime through gRPC
-> DeepSeek model call through LangChain
-> E2B sandbox if tools/code are needed
-> result returned through gRPC
-> API validates output schema
-> API resolves task
-> Solana settlement
-> PostgreSQL reputation and settlement events
```

### 5.2 Discovery Flow

```text
Marketplace / SDK
-> Bun + Hono API
-> PostgreSQL exact filters
-> pgvector semantic capability search if needed
-> ranking score
-> marketplace results
```

### 5.3 Delegation Flow

```text
Python agent decides delegation is needed
-> API creates child task
-> child task follows normal escrow and execution flow
-> child result returns to parent agent
-> parent agent submits final result
-> Graph API returns parent-child tree
```

## 6. Model Strategy

The MVP should start with DeepSeek as the default model provider.

Model requirements:

- Provider must be selected through configuration, not hard-coded inside business logic.
- Every agent or skill may define a preferred model.
- Model outputs must be validated against skill output schemas.
- Provider failures should surface as execution failures or retries, not as settlement changes.
- Model metadata should be recorded for observability, but public APIs should not expose private prompts or hidden reasoning.

Suggested provider abstraction:

```text
ModelRegistry
  -> DeepSeekProvider
  -> OpenAIProvider
  -> AnthropicProvider
  -> LocalProvider
```

Default MVP config:

```text
DEFAULT_MODEL_PROVIDER=deepseek
DEFAULT_MODEL_NAME=deepseek-chat
```

## 7. Repository Shape

Recommended monorepo layout:

```text
apps/
  web/                 # Next.js marketplace
  api/                 # Bun + Hono API
services/
  agent-runtime/       # Python LangGraph/LangChain/E2B service
packages/
  db/                  # Drizzle schema and migrations
  proto/               # Protocol Buffers definitions and generated clients
  solana-client/       # TypeScript settlement adapter
programs/
  escrow/              # Anchor program
docs/
  thought.md
  spec.md
  design.md
  tech-stack.md
```

Tooling defaults:

- Use Bun for TypeScript package management and scripts.
- Use `uv` for Python package management.
- Use Anchor tooling for Solana programs.
- Generate gRPC/proto clients as part of build or codegen scripts.

## 8. Implementation Order

### Recommended First `/goal` Scope

The first implementation goal should build a testable Phase 1 foundation only.

In scope:

- Monorepo skeleton with Bun workspaces and a Python `uv` service placeholder.
- `apps/api` using Bun and Hono.
- `packages/db` with Drizzle schema for agents, skills, tasks, task results, reputation events, and settlement events.
- Mock settlement adapter with escrow lock, payout, refund, and fee event behavior.
- Mock runtime adapter with deterministic task execution and result submission behavior.
- Core task state machine.
- Agent and skill registration APIs.
- Discovery filtering and ranking.
- Task create, accept, reject, submit result, resolve, and graph APIs.
- Coordination graph built from `parent_task_id`.
- Tests for state transitions, discovery, coordination graph generation, fee math, and core authorization rules.

Out of scope for the first goal:

- Next.js frontend.
- Real Solana or Anchor program implementation.
- Real LangGraph runtime.
- E2B Sandbox integration.
- Privy wallet integration.
- gRPC code generation.
- Live DeepSeek, OpenAI, Anthropic, or local model calls.
- pgvector semantic search beyond schema readiness.

The first goal should prefer mocked adapters and stable interfaces so later goals can replace mocks with real Solana settlement, Python orchestration, E2B runtime, Privy auth, and model providers without rewriting the API state machine.

### Full MVP Order

1. Create monorepo skeleton with Bun workspaces and Python `uv` service.
2. Define Drizzle schema for agents, skills, tasks, results, settlement events, and reputation events.
3. Define proto contracts for runtime dispatch, progress, cancel, and result submission.
4. Implement Bun/Hono API with mocked settlement and mocked runtime.
5. Implement Next.js marketplace and task graph surfaces.
6. Implement Python LangGraph runtime with DeepSeek provider and E2B sandbox integration.
7. Replace mocked runtime with gRPC runtime calls.
8. Implement Anchor escrow program.
9. Replace mocked settlement with Solana settlement adapter.
10. Add reputation scoring, pgvector discovery, and multi-provider model fallback.

## 9. Risks and Constraints

- Cross-language boundaries require strict proto versioning.
- Solana settlement must be idempotent to avoid duplicate payout or refund attempts.
- LangGraph execution state must not diverge from task economic state in the API database.
- DeepSeek provider failures should not block future model providers.
- E2B sandbox artifacts must be filtered before public exposure.
- pgvector semantic matching should complement exact skill filters, not override them.
