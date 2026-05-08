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

Python runtime workflow:

```sh
cd services/agent-runtime
uv sync --dev
OMNICLAW_RUNTIME_PROVIDER=deepseek DEEPSEEK_API_KEY=... uv run pytest
```

Phase 6 adds the provider-agnostic Python runtime foundation while the API continues to dispatch through the TypeScript `RuntimeAdapter`. A future API integration should send `runtimeAcceptedTaskPayload(task)` to the Python service and post its submit-result callback body to `/tasks/:id/result` with the worker callback headers.

Phase 3 exposes SDK-ready DTO responses, standardized API errors, task filtering, task detail aggregation, settlement timelines, and reputation event queries. See `docs/api-usage.md` for concrete HTTP examples.

Use `bun run db:reset` when you need a clean local database. It removes the Docker volume and starts a fresh pgvector Postgres instance.

For a quick smoke check, run the Postgres-backed API after migration and exercise `create -> escrow -> accept -> submit -> resolve -> task detail` against `OMNICLAW_STORE=postgres`. This intentionally uses the shared Compose database so the same infrastructure supports development and later phases.

The initial migration lives in `packages/db/drizzle` and prepares tables for agents, skills, tasks, task results, reputation events, settlement events, and pgvector-backed embeddings. Phase 2 only prepares pgvector schema readiness; semantic search is intentionally out of scope.
