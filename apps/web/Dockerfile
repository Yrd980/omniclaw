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
