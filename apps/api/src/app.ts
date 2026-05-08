import { Hono } from "hono";
import { MockRuntimeAdapter } from "./adapters/runtime";
import { MockSettlementAdapter } from "./adapters/settlement";
import { DEFAULT_DISCOVERY_RANKING_CONFIG, type DiscoveryRankingConfig } from "./config";
import { ApiError } from "./errors";
import { createMemoryStore, type DataStore } from "./store";
import { registerAgent, registerSkill } from "./services/agents";
import { actorFromHeaders } from "./services/authorization";
import { discoverAgents } from "./services/discovery";
import { acceptTask, createTask, getTaskGraph, rejectTask, resolveTask, submitResult, type TaskServiceDeps } from "./services/tasks";

export type AppEnv = {
  store: DataStore;
  taskDeps: TaskServiceDeps;
  discoveryRanking: DiscoveryRankingConfig;
};

export const createApp = (env: Partial<AppEnv> = {}) => {
  const store = env.store ?? createMemoryStore();
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
    const agent = registerAgent(store, actorFromHeaders(c.req.raw.headers), await c.req.json());
    return c.json(agent, 201);
  });

  app.get("/agents/discover", (c) => c.json({ results: discoverAgents(store, Object.fromEntries(new URL(c.req.url).searchParams), discoveryRanking) }));

  app.get("/agents/:agentId", (c) => {
    const agent = store.agents.get(c.req.param("agentId"));
    return agent ? c.json(agent) : c.json({ error: "agent not found" }, 404);
  });

  app.post("/agents/:agentId/skills", async (c) => {
    const skill = registerSkill(store, actorFromHeaders(c.req.raw.headers), c.req.param("agentId"), await c.req.json());
    return c.json(skill, 201);
  });

  app.get("/agents/:agentId/skills", (c) => {
    const agentId = c.req.param("agentId");
    return c.json({ skills: [...store.skills.values()].filter((skill) => skill.agentId === agentId) });
  });

  app.post("/tasks", async (c) => {
    const task = await createTask(taskDeps, actorFromHeaders(c.req.raw.headers), await c.req.json());
    return c.json(task, 201);
  });

  app.get("/tasks/:taskId", (c) => {
    const task = store.tasks.get(c.req.param("taskId"));
    return task ? c.json(task) : c.json({ error: "task not found" }, 404);
  });

  app.post("/tasks/:taskId/accept", async (c) => c.json(await acceptTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"))));
  app.post("/tasks/:taskId/reject", async (c) => c.json(await rejectTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"))));

  app.post("/tasks/:taskId/result", async (c) => {
    const result = submitResult(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"), await c.req.json());
    return c.json(result, 201);
  });

  app.post("/tasks/:taskId/resolve", async (c) => c.json(await resolveTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"), await c.req.json())));

  app.get("/tasks/:taskId/graph", (c) => c.json(getTaskGraph(store, c.req.param("taskId"))));

  return { app, store, taskDeps };
};
