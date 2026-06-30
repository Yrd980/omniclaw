# Software Layer Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the software layer gaps — SIWS authentication, rate limiting, Docker Compose, and test coverage — to make OmniClaw testnet-ready.

**Architecture:** Implement SIWS auth as a new verification layer in the existing `actorFromHeaders` flow, add rate limiting as Hono middleware, containerize all services with Dockerfiles and compose orchestration, then add comprehensive tests.

**Tech Stack:** TypeScript, Bun, Hono, Next.js, Python, uv, Docker, `@noble/ed25519`, `@solana/wallet-adapter-react`

## Global Constraints

- `authMode: "signed"` must not break existing `authMode: "headers"` behavior
- Rate limiting uses in-memory sliding window (no Redis dependency)
- Docker Compose must start all 4 services (postgres, api, web, runtime)
- Tests use `bun:test` for TypeScript, `pytest` for Python
- All existing functionality must remain unchanged when `authMode: "headers"`

---

### Task 1: SIWS Backend — Parser and Verifier

**Covers:** S3, S7

**Files:**
- Create: `apps/api/src/auth/siws.ts`
- Create: `apps/api/src/auth/siws.test.ts`

**Interfaces:**
- Produces: `parseSiwsMessage(message: string): SiwsPayload`, `verifySiwsSignature(message: string, signature: string, publicKey: string): Promise<boolean>`, `verifySiwsChallenge(headers: Headers, config: SiwsConfig): Actor`

- [ ] **Step 1: Install `@noble/ed25519` dependency**

```bash
cd apps/api && bun add @noble/ed25519
```

- [ ] **Step 2: Create SIWS parser**

Create `apps/api/src/auth/siws.ts`:

```typescript
import { verify } from "@noble/ed25519";
import { ApiError } from "../errors";
import type { Actor } from "../types";

export type SiwsPayload = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string | null;
};

export type SiwsConfig = {
  domain: string;
  nonceExpirySeconds: number;
};

const SIWS_PATTERN = /^(.+?) wants you to sign in with your Solana account:\n(.+?)\n\n(.+?)\n\nURI: (.+?)\nVersion: (.+?)\nChain ID: (.+?)\nNonce: (.+?)\nIssued At: (.+?)(?:\nExpiration Time: (.+?))?$/;

export const parseSiwsMessage = (message: string): SiwsPayload => {
  const match = message.match(SIWS_PATTERN);
  if (!match) {
    throw new ApiError(400, "INVALID_SIWS_MESSAGE", "malformed SIWS message");
  }
  return {
    domain: match[1],
    address: match[2],
    statement: match[3],
    uri: match[4],
    version: match[5],
    chainId: match[6],
    nonce: match[7],
    issuedAt: match[8],
    expirationTime: match[9] ?? null,
  };
};

export const verifySiwsSignature = async (
  message: string,
  signature: string,
  publicKey: string,
): Promise<boolean> => {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, "base64");
    const publicKeyBytes = Buffer.from(publicKey, "base64");
    return await verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    return false;
  }
};

export const verifySiwsChallenge = async (
  headers: Headers,
  config: SiwsConfig,
): Promise<Actor> => {
  const message = headers.get("x-siws-message");
  const signature = headers.get("x-siws-signature");
  const address = headers.get("x-siws-address");

  if (!message || !signature || !address) {
    throw new ApiError(401, "MISSING_SIWS_HEADERS", "x-siws-message, x-siws-signature, and x-siws-address headers required");
  }

  const payload = parseSiwsMessage(message);

  if (payload.domain !== config.domain) {
    throw new ApiError(401, "INVALID_SIWS_DOMAIN", `expected domain ${config.domain}, got ${payload.domain}`);
  }

  if (payload.address !== address) {
    throw new ApiError(401, "SIWS_ADDRESS_MISMATCH", "signed address does not match header address");
  }

  if (payload.expirationTime) {
    const expiresAt = new Date(payload.expirationTime);
    if (expiresAt < new Date()) {
      throw new ApiError(401, "SIWS_EXPIRED", "signed message has expired");
    }
  }

  const issuedAt = new Date(payload.issuedAt);
  const maxAge = config.nonceExpirySeconds * 1000;
  if (Date.now() - issuedAt.getTime() > maxAge) {
    throw new ApiError(401, "SIWS_NONCE_EXPIRED", "signed message nonce has expired");
  }

  const valid = await verifySiwsSignature(message, signature, address);
  if (!valid) {
    throw new ApiError(401, "INVALID_SIWS_SIGNATURE", "signature verification failed");
  }

  return {
    wallet: address,
    agentId: headers.get("x-agent-id") ?? undefined,
    role: headers.get("x-role") === "admin" ? "admin" : headers.get("x-role") === "evaluator" ? "evaluator" : undefined,
  };
};
```

- [ ] **Step 3: Write unit tests for parser**

Create `apps/api/src/auth/siws.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { parseSiwsMessage, verifySiwsSignature } from "./siws";

describe("parseSiwsMessage", () => {
  test("parses valid SIWS message", () => {
    const message = `example.com wants you to sign in with your Solana account:
ABC123

Test statement

URI: https://example.com
Version: 1
Chain ID: mainnet
Nonce: abc123
Issued At: 2026-01-01T00:00:00Z
Expiration Time: 2026-01-01T00:05:00Z`;

    const result = parseSiwsMessage(message);
    expect(result.domain).toBe("example.com");
    expect(result.address).toBe("ABC123");
    expect(result.statement).toBe("Test statement");
    expect(result.uri).toBe("https://example.com");
    expect(result.version).toBe("1");
    expect(result.chainId).toBe("mainnet");
    expect(result.nonce).toBe("abc123");
    expect(result.issuedAt).toBe("2026-01-01T00:00:00Z");
    expect(result.expirationTime).toBe("2026-01-01T00:05:00Z");
  });

  test("parses message without expiration", () => {
    const message = `example.com wants you to sign in with your Solana account:
ABC123

Test statement

URI: https://example.com
Version: 1
Chain ID: mainnet
Nonce: abc123
Issued At: 2026-01-01T00:00:00Z`;

    const result = parseSiwsMessage(message);
    expect(result.expirationTime).toBeNull();
  });

  test("throws on malformed message", () => {
    expect(() => parseSiwsMessage("invalid")).toThrow("malformed SIWS message");
  });
});
```

- [ ] **Step 4: Run parser tests**

```bash
bun test apps/api/src/auth/siws.test.ts
```

Expected: PASS (parser tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/siws.ts apps/api/src/auth/siws.test.ts apps/api/package.json bun.lock
git commit -m "feat(auth): add SIWS message parser and signature verifier"
```

---

### Task 2: SIWS Backend — Authorization Integration

**Covers:** S3, S7

**Files:**
- Modify: `apps/api/src/services/authorization.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `verifySiwsChallenge(headers, config)` from Task 1
- Produces: `actorFromHeaders(headers, config?)` — now accepts optional config for signed mode

- [ ] **Step 1: Update authorization.ts**

Modify `apps/api/src/services/authorization.ts`:

```typescript
import type { SiwsConfig } from "../auth/siws";
import { verifySiwsChallenge } from "../auth/siws";
import type { RuntimeConfig } from "../config";
import { ApiError, invariant } from "../errors";
import type { Actor, Agent, Task } from "../types";

export const actorFromHeaders = async (headers: Headers, config?: RuntimeConfig): Promise<Actor> => {
  if (config?.authMode === "signed") {
    const siwsConfig: SiwsConfig = {
      domain: process.env.OMNICLAW_SIWS_DOMAIN ?? "localhost:3000",
      nonceExpirySeconds: Number(process.env.OMNICLAW_SIWS_NONCE_EXPIRY ?? "300"),
    };
    return verifySiwsChallenge(headers, siwsConfig);
  }

  const role = headers.get("x-role");
  if (role !== null && role !== "admin" && role !== "evaluator") {
    throw new ApiError(400, "INVALID_HEADER", "x-role must be admin or evaluator", { header: "x-role" });
  }
  return {
    agentId: headers.get("x-agent-id") ?? undefined,
    wallet: headers.get("x-wallet") ?? undefined,
    role: role ?? undefined,
  };
};

export const requirePublisher = (actor: Actor, agent: Agent) => {
  invariant(actor.wallet === agent.publisherWallet || actor.role === "admin", 403, "FORBIDDEN", "publisher wallet authorization required");
};

export const requireWorker = (actor: Actor, task: Task) => {
  invariant(actor.agentId === task.workerAgentId || actor.role === "admin", 403, "FORBIDDEN", "worker authorization required");
};

export const requireHirerOrEvaluator = (actor: Actor, task: Task) => {
  invariant(
    actor.agentId === task.hirerAgentId || actor.role === "evaluator" || actor.role === "admin",
    403,
    "FORBIDDEN",
    "hirer, evaluator, or admin authorization required",
  );
};
```

- [ ] **Step 2: Update app.ts to pass config to actorFromHeaders**

Modify `apps/api/src/app.ts` — update all `actorFromHeaders(c.req.raw.headers)` calls to `await actorFromHeaders(c.req.raw.headers, runtimeConfig)`:

```typescript
// In createApp function, add runtimeConfig to destructuring:
const { app, store, taskDeps, runtimeConfig } = createApp(env);

// Update all route handlers that call actorFromHeaders:
// Example for POST /agents:
const agent = await registerAgent(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), { ... });
```

Apply the same pattern to all routes: POST /agents, POST /agents/:agentId/skills, POST /tasks, POST /tasks/:taskId/accept, POST /tasks/:taskId/reject, POST /tasks/:taskId/expire, POST /tasks/:taskId/result, POST /tasks/:taskId/resolve.

- [ ] **Step 3: Add SIWS environment variables to config**

No changes needed to `config.ts` — `authMode: "signed"` is already supported. Add SIWS-specific env vars to `.env.example`:

```env
OMNICLAW_AUTH_MODE=headers
OMNICLAW_SIWS_DOMAIN=localhost:3000
OMNICLAW_SIWS_NONCE_EXPIRY=300
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/authorization.ts apps/api/src/app.ts .env.example
git commit -m "feat(auth): integrate SIWS verification into actorFromHeaders"
```

---

### Task 3: SIWS Frontend — Wallet Connection and Signing

**Covers:** S3, S7

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/wallet-provider.tsx`
- Modify: `apps/web/src/components/omniclaw-mvp.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `@solana/wallet-adapter-react` for wallet connection
- Produces: `x-siws-message`, `x-siws-signature`, `x-siws-address` headers

- [ ] **Step 1: Install Solana wallet adapter dependencies**

```bash
cd apps/web && bun add @solana/wallet-adapter-react @solana/wallet-adapter-wallets @solana/wallet-adapter-base @solana/web3.js
```

- [ ] **Step 2: Create WalletProvider component**

Create `apps/web/src/components/wallet-provider.tsx`:

```typescript
"use client";

import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo } from "react";

const ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        {children}
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 3: Create SIWS signing utility**

Create `apps/web/src/lib/siws.ts`:

```typescript
export type SiwsMessageParams = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: string;
  nonce: string;
};

export const createSiwsMessage = (params: SiwsMessageParams): string => {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return `${params.domain} wants you to sign in with your Solana account:
${params.address}

${params.statement}

URI: ${params.uri}
Version: 1
Chain ID: ${params.chainId}
Nonce: ${params.nonce}
Issued At: ${now}
Expiration Time: ${expires}`;
};

export const generateNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
};
```

- [ ] **Step 4: Update layout.tsx to wrap with WalletProvider**

Modify `apps/web/src/app/layout.tsx`:

```typescript
import { WalletProvider } from "@/components/wallet-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Update OmniClawMvp to use wallet signing**

Modify `apps/web/src/components/omniclaw-mvp.tsx` — add wallet connection UI and SIWS signing:

```typescript
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createSiwsMessage, generateNonce } from "@/lib/siws";

// In OmniClawMvp component, add:
const { connection } = useConnection();
const { publicKey, signMessage, connected, connect, disconnect } = useWallet();

// Add wallet connection button in the UI
// Update the client to send SIWS headers when wallet is connected

const signSiwsHeaders = async (): Promise<Record<string, string>> => {
  if (!publicKey || !signMessage) {
    return {};
  }

  const message = createSiwsMessage({
    domain: window.location.host,
    address: publicKey.toBase58(),
    statement: "Sign in to OmniClaw",
    uri: window.location.origin,
    chainId: "mainnet",
    nonce: generateNonce(),
  });

  const encodedMessage = new TextEncoder().encode(message);
  const signature = await signMessage(encodedMessage);

  return {
    "x-siws-message": message,
    "x-siws-signature": Buffer.from(signature).toString("base64"),
    "x-siws-address": publicKey.toBase58(),
  };
};
```

- [ ] **Step 6: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/components/wallet-provider.tsx apps/web/src/lib/siws.ts apps/web/src/app/layout.tsx apps/web/src/components/omniclaw-mvp.tsx bun.lock
git commit -m "feat(auth): add Solana wallet connection and SIWS signing to frontend"
```

---

### Task 4: Rate Limiting Middleware

**Covers:** S4, S7

**Files:**
- Create: `apps/api/src/middleware/rate-limit.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `rateLimit(config?: RateLimitConfig): Middleware` — Hono middleware

- [ ] **Step 1: Create rate limit middleware**

Create `apps/api/src/middleware/rate-limit.ts`:

```typescript
import type { MiddlewareHandler } from "hono";
import { ApiError } from "../errors";

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 100,
};

type WindowEntry = {
  timestamps: number[];
};

const windows = new Map<string, WindowEntry>();

const cleanup = (windowMs: number) => {
  const now = Date.now();
  for (const [key, entry] of windows.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) {
      windows.delete(key);
    }
  }
};

export const rateLimit = (config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG): MiddlewareHandler => {
  const { windowMs, maxRequests } = config;

  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
    const now = Date.now();

    let entry = windows.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      windows.set(ip, entry);
    }

    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(maxRequests));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil((oldestInWindow + windowMs) / 1000)));

      throw new ApiError(429, "RATE_LIMITED", "Too many requests, please try again later", { retryAfter });
    }

    entry.timestamps.push(now);
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(maxRequests - entry.timestamps.length));
    c.header("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));

    if (Math.random() < 0.01) {
      cleanup(windowMs);
    }

    await next();
  };
};
```

- [ ] **Step 2: Add rate limit middleware to app.ts**

Modify `apps/api/src/app.ts`:

```typescript
import { rateLimit, type RateLimitConfig } from "./middleware/rate-limit";

// In createApp function, add rate limit config:
const rateLimitConfig: RateLimitConfig = {
  windowMs: Number(process.env.OMNICLAW_RATE_LIMIT_WINDOW_MS ?? "60000"),
  maxRequests: Number(process.env.OMNICLAW_RATE_LIMIT_MAX_REQUESTS ?? "100"),
};

// Add middleware before routes:
app.use("*", rateLimit(rateLimitConfig));
```

- [ ] **Step 3: Add rate limit env vars to .env.example**

```env
OMNICLAW_RATE_LIMIT_WINDOW_MS=60000
OMNICLAW_RATE_LIMIT_MAX_REQUESTS=100
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/rate-limit.ts apps/api/src/app.ts .env.example
git commit -m "feat(api): add in-memory rate limiting middleware"
```

---

### Task 5: Docker — API Dockerfile

**Covers:** S5, S7

**Files:**
- Create: `apps/api/Dockerfile`

- [ ] **Step 1: Create API Dockerfile**

Create `apps/api/Dockerfile`:

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/sdk/package.json packages/sdk/
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY . .

FROM base AS runner
COPY --from=builder /app .
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]
```

- [ ] **Step 2: Test Docker build**

```bash
docker build -f apps/api/Dockerfile -t omniclaw-api .
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/api/Dockerfile
git commit -m "feat(docker): add API Dockerfile"
```

---

### Task 6: Docker — Web Dockerfile

**Covers:** S5, S7

**Files:**
- Create: `apps/web/Dockerfile`

- [ ] **Step 1: Create Web Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
RUN npm install -g bun
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
RUN bun install --frozen-lockfile

FROM base AS builder
RUN npm install -g bun
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && bun run build

FROM base AS runner
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 2: Update next.config.ts for standalone output**

Check if `apps/web/next.config.ts` has `output: "standalone"`. If not, add it:

```typescript
const nextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 3: Test Docker build**

```bash
docker build -f apps/web/Dockerfile -t omniclaw-web .
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/web/Dockerfile apps/web/next.config.ts
git commit -m "feat(docker): add Web Dockerfile with standalone output"
```

---

### Task 7: Docker — Runtime Dockerfile and Compose

**Covers:** S5, S7

**Files:**
- Create: `services/agent-runtime/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create Runtime Dockerfile**

Create `services/agent-runtime/Dockerfile`:

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY src/ ./src/

EXPOSE 50051
CMD ["uv", "run", "python", "-m", "omniclaw_agent_runtime.grpc_service", "--bind", "0.0.0.0:50051"]
```

- [ ] **Step 2: Update docker-compose.yml**

Modify `docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: omniclaw
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      OMNICLAW_ENV: local
      OMNICLAW_STORE: postgres
      OMNICLAW_AUTH_MODE: signed
      OMNICLAW_RATE_LIMIT_WINDOW_MS: "60000"
      OMNICLAW_RATE_LIMIT_MAX_REQUESTS: "100"
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/omniclaw
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
      NEXT_PUBLIC_OMNICLAW_API_URL: http://api:3000
    depends_on:
      - api

  runtime:
    build:
      context: .
      dockerfile: services/agent-runtime/Dockerfile
    ports:
      - "50051:50051"
    environment:
      OMNICLAW_RUNTIME_PROVIDER: echo
    depends_on:
      - api

volumes:
  postgres_data:
```

- [ ] **Step 3: Test Docker Compose**

```bash
docker compose up -d --build
docker compose ps
```

Expected: All 4 services running

- [ ] **Step 4: Stop services**

```bash
docker compose down
```

- [ ] **Step 5: Commit**

```bash
git add services/agent-runtime/Dockerfile docker-compose.yml
git commit -m "feat(docker): add Runtime Dockerfile and complete Docker Compose orchestration"
```

---

### Task 8: Tests — Rate Limiting

**Covers:** S6

**Files:**
- Create: `apps/api/src/middleware/rate-limit.test.ts`

- [ ] **Step 1: Write rate limit tests**

Create `apps/api/src/middleware/rate-limit.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "./rate-limit";

const createApp = (maxRequests: number = 3) => {
  const app = new Hono();
  app.use("*", rateLimit({ windowMs: 1000, maxRequests }));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
};

describe("rateLimit", () => {
  test("allows requests within limit", async () => {
    const app = createApp(3);
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  test("blocks requests exceeding limit", async () => {
    const app = createApp(2);
    await app.request("/test");
    await app.request("/test");
    const res = await app.request("/test");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  test("returns correct remaining count", async () => {
    const app = createApp(5);
    const res1 = await app.request("/test");
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("4");
    const res2 = await app.request("/test");
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("3");
  });
});
```

- [ ] **Step 2: Run rate limit tests**

```bash
bun test apps/api/src/middleware/rate-limit.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/rate-limit.test.ts
git commit -m "test(api): add rate limiting middleware tests"
```

---

### Task 9: Tests — API Routes

**Covers:** S6

**Files:**
- Create: `apps/api/src/__tests__/routes/agents.test.ts`
- Create: `apps/api/src/__tests__/routes/tasks.test.ts`

- [ ] **Step 1: Write agent route tests**

Create `apps/api/src/__tests__/routes/agents.test.ts`:

```typescript
import { describe, expect, test, beforeEach } from "bun:test";
import { createApp } from "../../app";

describe("Agent Routes", () => {
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(() => {
    const result = createApp();
    app = result.app;
  });

  test("POST /agents registers an agent", async () => {
    const res = await app.request("/agents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wallet": "wallet_test",
      },
      body: JSON.stringify({
        publisher_wallet: "wallet_test",
        name: "Test Agent",
        description: "A test agent",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Test Agent");
    expect(data.publisher_wallet).toBe("wallet_test");
  });

  test("GET /agents/:id returns agent", async () => {
    const createRes = await app.request("/agents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wallet": "wallet_test",
      },
      body: JSON.stringify({
        publisher_wallet: "wallet_test",
        name: "Test Agent",
        description: "A test agent",
      }),
    });
    const created = await createRes.json();

    const res = await app.request(`/agents/${created.agent_id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.agent_id).toBe(created.agent_id);
  });

  test("GET /agents/discover returns matching agents", async () => {
    await app.request("/agents", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wallet": "wallet_test",
      },
      body: JSON.stringify({
        publisher_wallet: "wallet_test",
        name: "Research Agent",
        description: "Market research agent",
      }),
    });

    const res = await app.request("/agents/discover?capability=market_research");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toBeArray();
  });
});
```

- [ ] **Step 2: Write task route tests**

Create `apps/api/src/__tests__/routes/tasks.test.ts`:

```typescript
import { describe, expect, test, beforeEach } from "bun:test";
import { createApp } from "../../app";

describe("Task Routes", () => {
  let app: ReturnType<typeof createApp>["app"];
  let hirerAgentId: string;
  let workerAgentId: string;
  let skillId: string;

  beforeEach(async () => {
    const result = createApp();
    app = result.app;

    const hirerRes = await app.request("/agents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wallet": "wallet_hirer" },
      body: JSON.stringify({ publisher_wallet: "wallet_hirer", name: "Hirer", description: "Hirer agent" }),
    });
    const hirer = await hirerRes.json();
    hirerAgentId = hirer.agent_id;

    const workerRes = await app.request("/agents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wallet": "wallet_worker" },
      body: JSON.stringify({ publisher_wallet: "wallet_worker", name: "Worker", description: "Worker agent" }),
    });
    const worker = await workerRes.json();
    workerAgentId = worker.agent_id;

    const skillRes = await app.request(`/agents/${workerAgentId}/skills`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-wallet": "wallet_worker" },
      body: JSON.stringify({
        name: "test_skill",
        description: "Test skill",
        base_price_lamports: "1000000",
        estimated_latency_ms: 5000,
      }),
    });
    const skill = await skillRes.json();
    skillId = skill.skill_id;
  });

  test("POST /tasks creates a task", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wallet": "wallet_hirer" },
      body: JSON.stringify({
        hirer_agent_id: hirerAgentId,
        worker_agent_id: workerAgentId,
        skill_id: skillId,
        payment_lamports: "5000000",
        deadline: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("created");
  });

  test("POST /tasks/:id/accept accepts a task", async () => {
    const createRes = await app.request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wallet": "wallet_hirer" },
      body: JSON.stringify({
        hirer_agent_id: hirerAgentId,
        worker_agent_id: workerAgentId,
        skill_id: skillId,
        payment_lamports: "5000000",
        deadline: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    const task = await createRes.json();

    const res = await app.request(`/tasks/${task.task_id}/accept`, {
      method: "POST",
      headers: { "x-wallet": "wallet_worker", "x-agent-id": workerAgentId },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("accepted");
  });
});
```

- [ ] **Step 3: Run route tests**

```bash
bun test apps/api/src/__tests__/routes/
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/
git commit -m "test(api): add agent and task route integration tests"
```

---

### Task 10: Tests — SDK Client

**Covers:** S6

**Files:**
- Create: `packages/sdk/src/__tests__/client.test.ts`

- [ ] **Step 1: Write SDK client tests**

Create `packages/sdk/src/__tests__/client.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { OmniClawClient, OmniClawApiError } from "../index";

const mockFetch = (response: unknown, status: number = 200) => {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => JSON.stringify(response),
    headers: new Headers(),
  }) as unknown as Response;
};

describe("OmniClawClient", () => {
  test("getHealth returns health data", async () => {
    const client = new OmniClawClient({
      baseUrl: "http://localhost:3000",
      fetch: mockFetch({ ok: true, environment: "local" }),
    });
    const health = await client.getHealth();
    expect(health.ok).toBe(true);
  });

  test("registerAgent sends correct request", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: unknown;
    const client = new OmniClawClient({
      baseUrl: "http://localhost:3000",
      fetch: async (url: string | URL, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
        return mockFetch({ agent_id: "agent_1", name: "Test" })();
      },
    });
    await client.registerAgent({
      publisher_wallet: "wallet_1",
      name: "Test",
      description: "Test agent",
    });
    expect(capturedUrl).toContain("/agents");
    expect(capturedBody).toMatchObject({
      publisher_wallet: "wallet_1",
      name: "Test",
    });
  });

  test("throws OmniClawApiError on error response", async () => {
    const client = new OmniClawClient({
      baseUrl: "http://localhost:3000",
      fetch: mockFetch({ error: { code: "NOT_FOUND", message: "not found" } }, 404),
    });
    await expect(client.getAgent("nonexistent")).rejects.toThrow(OmniClawApiError);
  });
});
```

- [ ] **Step 2: Run SDK tests**

```bash
bun test packages/sdk/src/__tests__/client.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/__tests__/
git commit -m "test(sdk): add client unit tests"
```

---

### Task 11: Tests — Runtime (Python)

**Covers:** S6

**Files:**
- Create: `services/agent-runtime/tests/test_contracts.py`
- Create: `services/agent-runtime/tests/test_orchestrator.py`

- [ ] **Step 1: Write contracts tests**

Create `services/agent-runtime/tests/test_contracts.py`:

```python
import pytest
from omniclaw_agent_runtime.contracts import validate_dispatch_request, ContractError


def test_validate_dispatch_request_valid():
    request = {
        "task_id": "task_1",
        "hirer_agent_id": "agent_hirer",
        "worker_agent_id": "agent_worker",
        "skill_id": "skill_1",
        "task_payload": {},
        "payment_lamports": "5000000",
        "worker_payout_lamports": "4500000",
        "deadline": "2026-12-31T23:59:59Z",
        "accepted_at": "2026-01-01T00:00:00Z",
        "callback": {
            "method": "POST",
            "path": "/tasks/task_1/result",
            "actor_headers": {},
        },
    }
    result = validate_dispatch_request(request)
    assert result.task_id == "task_1"


def test_validate_dispatch_request_missing_field():
    request = {"task_id": "task_1"}
    with pytest.raises(ContractError):
        validate_dispatch_request(request)
```

- [ ] **Step 2: Write orchestrator tests**

Create `services/agent-runtime/tests/test_orchestrator.py`:

```python
import pytest
from omniclaw_agent_runtime.orchestrator import RuntimeOrchestrator
from omniclaw_agent_runtime.providers import EchoProvider
from omniclaw_agent_runtime.sandbox import NoopSandbox
from omniclaw_agent_runtime.graphs import LinearRuntimeGraph


@pytest.fixture
def orchestrator():
    return RuntimeOrchestrator(
        provider=EchoProvider(),
        sandbox=NoopSandbox(),
        graph=LinearRuntimeGraph(),
    )


def test_orchestrator_dispatch(orchestrator):
    request = {
        "task_id": "task_1",
        "hirer_agent_id": "agent_hirer",
        "worker_agent_id": "agent_worker",
        "skill_id": "skill_1",
        "task_payload": {"query": "test"},
        "payment_lamports": "5000000",
        "worker_payout_lamports": "4500000",
        "deadline": "2026-12-31T23:59:59Z",
        "accepted_at": "2026-01-01T00:00:00Z",
        "callback": {
            "method": "POST",
            "path": "/tasks/task_1/result",
            "actor_headers": {},
        },
    }
    result = orchestrator.dispatch(request)
    assert result["accepted"] is True
    assert "result_payload" in result
```

- [ ] **Step 3: Run runtime tests**

```bash
cd services/agent-runtime && uv run pytest tests/ -v
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add services/agent-runtime/tests/
git commit -m "test(runtime): add contracts and orchestrator unit tests"
```

---

### Task 12: Final Verification

**Covers:** S8

- [ ] **Step 1: Run full TypeScript typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 2: Run all TypeScript tests**

```bash
bun test
```

Expected: All tests PASS

- [ ] **Step 3: Run all Python tests**

```bash
cd services/agent-runtime && uv run pytest
```

Expected: All tests PASS

- [ ] **Step 4: Verify Docker Compose**

```bash
docker compose up -d --build
sleep 10
curl -s http://localhost:3000/health | jq .
docker compose down
```

Expected: Health endpoint returns JSON with `ok: true`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: software layer closure — SIWS auth, rate limiting, Docker, tests"
```
