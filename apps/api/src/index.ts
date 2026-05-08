import { createApp } from "./app";

const { app } = createApp();

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
});

console.log(`OmniClaw API listening on http://localhost:${process.env.PORT ?? 3000}`);
