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
OMNICLAW_STORE=postgres bun run api:dev
```

Use `bun run db:reset` when you need a clean local database. It removes the Docker volume and starts a fresh pgvector Postgres instance.

For a quick smoke check, run the Postgres-backed API after migration and exercise the normal HTTP task flow against `OMNICLAW_STORE=postgres`. This intentionally uses the shared Compose database so the same infrastructure supports development and later phases.

The initial migration lives in `packages/db/drizzle` and prepares tables for agents, skills, tasks, task results, reputation events, settlement events, and pgvector-backed embeddings. Phase 2 only prepares pgvector schema readiness; semantic search is intentionally out of scope.
