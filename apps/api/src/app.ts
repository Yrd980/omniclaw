import { createDatabaseConnection } from "@omniclaw/db";
import { Hono } from "hono";
import { MockRuntimeAdapter } from "./adapters/runtime";
import { MockSettlementAdapter } from "./adapters/settlement";
import { DEFAULT_DISCOVERY_RANKING_CONFIG, type DiscoveryRankingConfig } from "./config";
import { ApiError } from "./errors";
import { createPostgresStore } from "./postgres-store";
import { createMemoryStore, type DataStore } from "./store";
import { registerAgent, registerSkill } from "./services/agents";
import { actorFromHeaders } from "./services/authorization";
import { discoverAgents } from "./services/discovery";
import { acceptTask, createTask, expireTask, getTaskGraph, rejectTask, resolveTask, submitResult, type TaskServiceDeps } from "./services/tasks";

export type AppEnv = {
  store: DataStore;
  taskDeps: TaskServiceDeps;
  discoveryRanking: DiscoveryRankingConfig;
};

export const createApp = (env: Partial<AppEnv> = {}) => {
  const store = env.store ?? createStoreFromEnv();
  const taskDeps = env.taskDeps ?? {
    store,
    settlement: new MockSettlementAdapter(undefined, store.now),
    runtime: new MockRuntimeAdapter(),
  };
  const discoveryRanking = env.discoveryRanking ?? DEFAULT_DISCOVERY_RANKING_CONFIG;
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: error.message }, error.status as never);
    }
    return c.json({ error: "internal server error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/agents", async (c) => {
    const agent = await registerAgent(store, actorFromHeaders(c.req.raw.headers), await c.req.json());
    return c.json(agent, 201);
  });

  app.get("/agents/discover", async (c) =>
    c.json({ results: await discoverAgents(store, Object.fromEntries(new URL(c.req.url).searchParams), discoveryRanking) })
  );

  app.get("/agents/:agentId", async (c) => {
    const agent = await store.getAgent(c.req.param("agentId"));
    return agent ? c.json(agent) : c.json({ error: "agent not found" }, 404);
  });

  app.post("/agents/:agentId/skills", async (c) => {
    const skill = await registerSkill(store, actorFromHeaders(c.req.raw.headers), c.req.param("agentId"), await c.req.json());
    return c.json(skill, 201);
  });

  app.get("/agents/:agentId/skills", async (c) => {
    const agentId = c.req.param("agentId");
    return c.json({ skills: (await store.listSkills()).filter((skill) => skill.agentId === agentId) });
  });

  app.post("/tasks", async (c) => {
    const task = await createTask(taskDeps, actorFromHeaders(c.req.raw.headers), await c.req.json());
    return c.json(task, 201);
  });

  app.get("/tasks/:taskId", async (c) => {
    const task = await store.getTask(c.req.param("taskId"));
    return task ? c.json(task) : c.json({ error: "task not found" }, 404);
  });

  app.post("/tasks/:taskId/accept", async (c) => c.json(await acceptTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"))));
  app.post("/tasks/:taskId/reject", async (c) => c.json(await rejectTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"))));
  app.post("/tasks/:taskId/expire", async (c) => c.json(await expireTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"))));

  app.post("/tasks/:taskId/result", async (c) => {
    const result = await submitResult(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"), await c.req.json());
    return c.json(result, 201);
  });

  app.post("/tasks/:taskId/resolve", async (c) => c.json(await resolveTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"), await c.req.json())));

  app.get("/tasks/:taskId/graph", async (c) => c.json(await getTaskGraph(store, c.req.param("taskId"))));

  return { app, store, taskDeps };
};

const createStoreFromEnv = () => {
  if (process.env.OMNICLAW_STORE === "postgres") {
    return createPostgresStore(createDatabaseConnection().db);
  }
  return createMemoryStore();
};
