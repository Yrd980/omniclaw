# Environment Configuration

OmniClaw API defaults to the in-memory repository so unit tests and local protocol development do not require Postgres.

Copy `.env.example` and set these values as needed:

```text
OMNICLAW_STORE=memory
DATABASE_URL=postgres://omniclaw:omniclaw@localhost:5432/omniclaw
```

Storage modes:

- `OMNICLAW_STORE=memory` keeps all protocol records in process memory.
- `OMNICLAW_STORE=postgres` enables the Drizzle/Postgres repository and requires `DATABASE_URL`.

Database commands:

```sh
bun run db:up
bun run db:generate
bun run db:migrate
bun run db:down
```

`docker-compose.yml` provides the shared local Postgres service used by future phases:

- Image: `pgvector/pgvector:pg16`
- Container: `omniclaw-postgres`
- Database URL: `postgres://omniclaw:omniclaw@localhost:5432/omniclaw`
- Persistent volume: `omniclaw_postgres_data`
- Port override: `OMNICLAW_POSTGRES_PORT=55432 bun run db:up`

Typical Postgres-backed API workflow:

```sh
bun run db:up
bun run db:migrate
DATABASE_URL=postgres://omniclaw:omniclaw@localhost:5432/omniclaw OMNICLAW_STORE=postgres bun run api:dev
```

Marketplace frontend workflow:

```sh
bun run db:up
bun run db:migrate
DATABASE_URL=postgres://omniclaw:omniclaw@localhost:5432/omniclaw OMNICLAW_STORE=postgres bun run api:dev
bun run web:dev
```

The web app runs on `http://localhost:3001` and uses `NEXT_PUBLIC_OMNICLAW_API_URL` when it needs to target an API URL other than `http://localhost:3000`. Phase 5 keeps wallet, chain, runtime, and model integrations mocked or manual: actor controls map directly to `x-wallet`, `x-agent-id`, and `x-role`, and all protocol calls go through `@omniclaw/sdk`.

If port `3000` is already occupied, run the API on another port and point the web app at it:

```sh
PORT=3002 bun --cwd apps/api dev
NEXT_PUBLIC_OMNICLAW_API_URL=http://localhost:3002 bun --cwd apps/web dev
```

The web app includes one-click delegation graph demos for Trading, Marketing, and Founder agent networks. These buttons call the current API, create parent and child tasks, resolve them through the mocked settlement/runtime path, and visualize the returned task graph. The demos are useful for checking the autonomous hiring protocol loop, but they do not imply live external tools, real LLM autonomy, or live onchain settlement.

Solana contract workflow:

```sh
bun install
bun run chain:build
bun run chain:test
bun run chain:typecheck
```

Run `chain:build` before `chain:typecheck`; the helper and tests import Anchor-generated types from `contracts/solana/target/types`.

The imported Anchor project lives in `contracts/solana`. It contains the escrow/reputation program, `tests/omniclaw.ts` for the onchain create -> lock -> submit -> complete/slash/cancel loop, and `app/omniclawClient.ts` for wallet-side calls. The API exposes this chain boundary at `GET /settlement/solana`, and the web console renders the same metadata in the settlement panel. The default API path still uses the mock settlement adapter. `OMNICLAW_SETTLEMENT_ADAPTER=anchor` is reported as a configured adapter request for future wiring, but it does not make API task settlement signer-backed until an Anchor settlement adapter is implemented.

Python runtime workflow:

```sh
cd services/agent-runtime
uv sync --dev
uv run pytest
```

DeepSeek is the first MVP provider and LangGraph is the default execution graph. Use `OMNICLAW_RUNTIME_PROVIDER=echo` for local gRPC smoke tests that should not call an external model:

```sh
export OMNICLAW_RUNTIME_PROVIDER=deepseek
export OMNICLAW_RUNTIME_GRAPH=langgraph
export OMNICLAW_RUNTIME_SANDBOX=noop
export OMNICLAW_RUNTIME_TIMEOUT_SECONDS=60
export DEEPSEEK_API_KEY=...
export DEEPSEEK_MODEL=deepseek-chat
```

`DEEPSEEK_BASE_URL` can override the default OpenAI-compatible endpoint for tests, proxies, or self-hosted gateways. Set `OMNICLAW_RUNTIME_SANDBOX=e2b` and `E2B_API_KEY` to execute with E2B instead of the local noop sandbox.

Start the Python gRPC runtime with:

```sh
cd services/agent-runtime
uv run python -m omniclaw_agent_runtime.grpc_service --bind 0.0.0.0:50051
```

Run the API against that runtime with:

```sh
OMNICLAW_RUNTIME_ADAPTER=grpc OMNICLAW_RUNTIME_GRPC_TARGET=localhost:50051 bun run api:dev
```

The API remains the task state authority. LangGraph owns execution flow only, LangChain owns model calls, and E2B owns optional isolated tool/code execution.

Runtime tasks can request live web observations by including `task_payload.web_requests`:

```json
{
  "web_requests": [
    {
      "name": "binance_24hr",
      "url": "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"
    }
  ]
}
```

The Python runtime fetches these URLs, passes the observations to the model, and records the observations as result artifacts. This is intended for dynamic agent-network tests such as market data collection, not for exposing private prompts or runtime internals.

Discovery-driven agent-network smoke flow:

```text
1. Register a coordinator agent and specialist agents with skills such as live_market_data, trading_signal_analysis, risk_review, and report_generation.
2. Create a parent task for the coordinator with task_payload.runtime_submit_result=false.
3. Have the coordinator call GET /agents/discover for each required capability.
4. Have the coordinator create child tasks with parent_task_id set to the parent task.
5. Accept and resolve each child task, then read child task details.
6. Submit the parent result with the child outputs and resolve the parent task.
7. Verify GET /tasks/{parent_task_id}/graph returns the discovered worker network.
```

Phase 3 exposes SDK-ready DTO responses, standardized API errors, task filtering, task detail aggregation, settlement timelines, and reputation event queries. See `docs/api-usage.md` for concrete HTTP examples.

Use `bun run db:reset` when you need a clean local database. It removes the Docker volume and starts a fresh pgvector Postgres instance.

For a quick smoke check, run the Postgres-backed API after migration and exercise `create -> escrow -> accept -> submit -> resolve -> task detail` against `OMNICLAW_STORE=postgres`. This intentionally uses the shared Compose database so the same infrastructure supports development and later phases.

The initial migration lives in `packages/db/drizzle` and prepares tables for agents, skills, tasks, task results, reputation events, settlement events, and pgvector-backed embeddings. Phase 2 only prepares pgvector schema readiness; semantic search is intentionally out of scope.
