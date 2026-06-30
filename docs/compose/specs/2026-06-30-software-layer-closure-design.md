# Software Layer Closure Design

## [S1] Problem

OmniClaw's software control plane (API, SDK, frontend, runtime orchestration) is ~90% complete, but three critical gaps prevent testnet deployment:

1. **Authentication**: `authMode: "signed"` is declared but unimplemented; anyone can forge `x-wallet` headers
2. **Rate Limiting**: No request throttling; API is vulnerable to abuse
3. **Containerization**: Only PostgreSQL is in docker-compose; API, Web, Runtime services lack Dockerfiles
4. **Test Coverage**: Zero test files across the entire project

## [S2] Solution Overview

Implement four components in dependency order:

1. SIWS (Sign-In with Solana) authentication — foundational, affects all other components
2. In-memory rate limiting — Hono middleware layer
3. Docker Compose — containerize all services
4. Test coverage — validate existing + new functionality

## [S3] SIWS Authentication

### Architecture

```
Frontend                    Backend
─────────                   ───────
1. Connect Solana wallet
2. Generate SIWS message
3. Sign message with wallet
4. Send {message, signature, publicKey} in headers
                              5. Parse SIWS message
                              6. Verify ed25519 signature
                              7. Extract wallet address
                              8. Set as actor identity
```

### SIWS Message Format

Standard SIWS message structure:
```
${domain} wants you to sign in with your Solana account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expiresAt}
```

### Backend Changes

**New file: `apps/api/src/auth/siws.ts`**
- `parseSiwsMessage(message: string): SiwsPayload` — parse and validate message fields
- `verifySignature(message: string, signature: string, publicKey: string): boolean` — ed25519 verification using `@noble/ed25519`
- `verifySiwsChallenge(headers: Headers): ActorIdentity` — full verification pipeline

**Modified: `apps/api/src/services/authorization.ts`**
- `actorFromHeaders()` — when `authMode === "signed"`, call `verifySiwsChallenge()` instead of reading raw headers

**Modified: `apps/api/src/config.ts`**
- Add `signed` to valid `authMode` values
- Add SIWS config: `domain`, `statement`, `nonceExpirySeconds`

### Frontend Changes

**Modified: `apps/web/src/components/omniclaw-mvp.tsx`**
- Add wallet connection UI (Phantom/Backpack)
- Add SIWS message generation and signing
- Send `x-siws-message`, `x-siws-signature`, `x-siws-address` headers

### Dependencies

- `@noble/ed25519` — ed25519 signature verification (backend)
- `@solana/wallet-adapter-react` — wallet connection (frontend)

### Security Considerations

- Nonce must be server-generated and time-limited (5 min expiry)
- Message must include domain binding to prevent replay attacks
- Signature must be verified against the claimed public key
- Expired messages must be rejected

## [S4] Rate Limiting

### Architecture

```
Request → RateLimitMiddleware → Route Handler
              ↓ (if exceeded)
           429 Too Many Requests
```

### Implementation

**New file: `apps/api/src/middleware/rate-limit.ts`**
- Sliding window algorithm using in-memory Map
- Key: IP address (from `x-forwarded-for` or connection IP)
- Configurable: `windowMs` (default: 60s), `maxRequests` (default: 100)
- Cleanup: periodic removal of expired entries

**Modified: `apps/api/src/app.ts`**
- Add rate limit middleware before route handlers
- Make configurable via environment variables

### Configuration

```env
OMNICLAW_RATE_LIMIT_WINDOW_MS=60000
OMNICLAW_RATE_LIMIT_MAX_REQUESTS=100
```

### Response Format

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests, please try again later",
    "retryAfter": 45
  }
}
```

Headers: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## [S5] Docker Compose

### Services

| Service | Base Image | Port | Dependencies |
|---------|-----------|------|--------------|
| postgres | pgvector/pgvector:pg16 | 5432 | — |
| api | oven/bun:1 | 3000 | postgres |
| web | node:20-alpine | 3001 | api |
| runtime | python:3.12-slim | 50051 | — |

### Dockerfiles

**`apps/api/Dockerfile`**
```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/sdk/package.json packages/sdk/
RUN bun install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]
```

**`apps/web/Dockerfile`**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
```

**`services/agent-runtime/Dockerfile`**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --no-dev
COPY src/ ./src/
EXPOSE 50051
CMD ["uv", "run", "python", "-m", "omniclaw_agent_runtime.grpc_service", "--bind", "0.0.0.0:50051"]
```

### docker-compose.yml Updates

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    # ... existing config ...

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - OMNICLAW_STORE=postgres
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/omniclaw
      - OMNICLAW_AUTH_MODE=signed
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NEXT_PUBLIC_OMNICLAW_API_URL=http://api:3000
    depends_on:
      - api

  runtime:
    build:
      context: .
      dockerfile: services/agent-runtime/Dockerfile
    ports:
      - "50051:50051"
    environment:
      - OMNICLAW_RUNTIME_PROVIDER=deepseek
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
    depends_on:
      - api
```

## [S6] Test Coverage

### Strategy

Feature-first: implement SIWS, rate limiting, containerization, then write tests.

### Test Matrix

| Component | Test Type | Framework | Priority |
|-----------|-----------|-----------|----------|
| API routes | Integration | bun:test | High |
| SIWS auth | Unit | bun:test | High |
| Rate limiting | Unit | bun:test | High |
| Store (memory) | Unit | bun:test | Medium |
| Store (postgres) | Integration | bun:test + testcontainers | Medium |
| SDK client | Unit | bun:test | Medium |
| Runtime | Unit | pytest | Medium |
| Frontend | Component | @testing-library/react | Low |

### Test Files

```
apps/api/src/__tests__/
  auth/
    siws.test.ts
  middleware/
    rate-limit.test.ts
  services/
    agents.test.ts
    tasks.test.ts
    discovery.test.ts
  store/
    memory-store.test.ts
  routes/
    agents.test.ts
    tasks.test.ts

packages/sdk/src/__tests__/
  client.test.ts

services/agent-runtime/tests/
  test_contracts.py
  test_orchestrator.py
```

### Coverage Targets

- SIWS auth: 100% (critical security path)
- Rate limiting: 100% (critical middleware)
- API routes: 80% (happy path + key error cases)
- Store: 80% (data integrity)
- SDK: 70% (client methods)

## [S7] Implementation Order

1. **SIWS Authentication** (backend + frontend)
2. **Rate Limiting** (middleware)
3. **Docker Compose** (Dockerfiles + compose update)
4. **Tests** (all components)

Each step builds on the previous. SIWS is foundational because it affects how all API endpoints handle identity. Rate limiting is a standalone middleware. Docker needs all features working. Tests validate everything.

## [S8] Success Criteria

- [ ] `authMode: "signed"` works end-to-end (wallet connect → sign → verify → API call)
- [ ] Rate limiting returns 429 after threshold
- [ ] `docker compose up` starts all 4 services
- [ ] `bun test` passes with >80% coverage on new code
- [ ] `bun run typecheck` passes
- [ ] Existing functionality unaffected when `authMode: "headers"`
