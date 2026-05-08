import { createDatabaseConnection } from "@omniclaw/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRuntimeAdapterFromEnv } from "./adapters/runtime-factory";
import { MockSettlementAdapter } from "./adapters/settlement";
import { DEFAULT_DISCOVERY_RANKING_CONFIG, type DiscoveryRankingConfig } from "./config";
import { agentDto, reputationEventDto, settlementEventDto, skillDto, taskDto, taskResultDto } from "./dto";
import { ApiError } from "./errors";
import { createPostgresStore } from "./postgres-store";
import { createMemoryStore, type DataStore } from "./store";
import { registerAgent, registerSkill } from "./services/agents";
import { actorFromHeaders } from "./services/authorization";
import { discoverAgents } from "./services/discovery";
import { acceptTask, createTask, expireTask, getTaskGraph, rejectTask, resolveTask, submitResult, type TaskServiceDeps } from "./services/tasks";
import {
  optionalAgentStatus,
  optionalArray,
  optionalJsonObject,
  optionalNumber,
  optionalNullableString,
  optionalString,
  optionalStringArray,
  queryLamports,
  queryNumber,
  queryString,
  queryTaskStatus,
  queryTimestamp,
  readJsonObjectBody,
  requireFutureTimestamp,
  requireLamports,
  requireString,
  requiredResolution,
} from "./validation";

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
    runtime: createRuntimeAdapterFromEnv(),
  };
  const discoveryRanking = env.discoveryRanking ?? DEFAULT_DISCOVERY_RANKING_CONFIG;
  const app = new Hono();

  app.use("*", cors({
    origin: "*",
    allowHeaders: ["content-type", "x-wallet", "x-agent-id", "x-role"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          path: new URL(c.req.url).pathname,
        },
      }, error.status as never);
    }
    return c.json({ error: { code: "INTERNAL_ERROR", message: "internal server error", details: null, path: new URL(c.req.url).pathname } }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/agents", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const agent = await registerAgent(store, actorFromHeaders(c.req.raw.headers), {
      publisher_wallet: requireString(body, "publisher_wallet"),
      name: requireString(body, "name"),
      description: requireString(body, "description"),
      status: optionalAgentStatus(body, "status"),
      reputation_score: optionalNumber(body, "reputation_score"),
      success_rate: optionalNumber(body, "success_rate"),
      avg_latency_ms: optionalNumber(body, "avg_latency_ms"),
      quality_score: optionalNumber(body, "quality_score"),
      delegation_success_rate: optionalNumber(body, "delegation_success_rate"),
      historical_earnings_lamports: optionalString(body, "historical_earnings_lamports"),
      stake_amount: optionalString(body, "stake_amount"),
    });
    return c.json(agentDto(agent), 201);
  });

  app.get("/agents/discover", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const results = await discoverAgents(store, {
      capability: queryString(params, "capability"),
      reputation_gt: queryNumber(params, "reputation_gt"),
      latency_lt_ms: queryNumber(params, "latency_lt_ms"),
      max_price_lamports: queryLamports(params, "max_price_lamports"),
      status: queryString(params, "status"),
    }, discoveryRanking);
    return c.json({ results: results.map((result) => ({ agent: agentDto(result.agent), skill: skillDto(result.skill), ranking: result.ranking })) });
  });

  app.get("/agents/:agentId", async (c) => {
    const agent = await store.getAgent(c.req.param("agentId"));
    return agent ? c.json(agentDto(agent)) : c.json(notFound("agent not found", c.req.raw), 404);
  });

  app.post("/agents/:agentId/skills", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const skill = await registerSkill(store, actorFromHeaders(c.req.raw.headers), c.req.param("agentId"), {
      name: requireString(body, "name"),
      description: requireString(body, "description"),
      input_schema: optionalJsonObject(body, "input_schema"),
      output_schema: optionalJsonObject(body, "output_schema"),
      base_price_lamports: requireLamports(body, "base_price_lamports"),
      estimated_latency_ms: optionalNumber(body, "estimated_latency_ms") ?? requiredNumber(body, "estimated_latency_ms"),
      required_permissions: optionalStringArray(body, "required_permissions"),
    });
    return c.json(skillDto(skill), 201);
  });

  app.get("/agents/:agentId/skills", async (c) => {
    const agentId = c.req.param("agentId");
    return c.json({ skills: (await store.listSkills()).filter((skill) => skill.agentId === agentId).map(skillDto) });
  });

  app.post("/tasks", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const task = await createTask(taskDeps, actorFromHeaders(c.req.raw.headers), {
      parent_task_id: optionalNullableString(body, "parent_task_id"),
      hirer_agent_id: requireString(body, "hirer_agent_id"),
      worker_agent_id: requireString(body, "worker_agent_id"),
      skill_id: requireString(body, "skill_id"),
      task_payload: optionalJsonObject(body, "task_payload"),
      payment_lamports: requireLamports(body, "payment_lamports"),
      deadline: requireFutureTimestamp(body, "deadline"),
    });
    return c.json(taskDto(task), 201);
  });

  app.get("/tasks", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const parentTaskId = params.has("parent_task_id") ? params.get("parent_task_id") : undefined;
    const tasks = await store.listTasksByFilters({
      hirerAgentId: queryString(params, "hirer_agent_id"),
      workerAgentId: queryString(params, "worker_agent_id"),
      status: queryTaskStatus(params),
      parentTaskId: parentTaskId === "null" ? null : parentTaskId ?? undefined,
      deadlineFrom: queryTimestamp(params, "deadline_from"),
      deadlineTo: queryTimestamp(params, "deadline_to"),
    });
    return c.json({ tasks: tasks.map(taskDto) });
  });

  app.get("/tasks/:taskId", async (c) => {
    const task = await store.getTask(c.req.param("taskId"));
    if (!task) {
      return c.json(notFound("task not found", c.req.raw), 404);
    }
    const result = await store.getTaskResultForTask(task.id);
    const settlementEvents = await store.listSettlementEventsByFilters({ taskId: task.id });
    const reputationEvents = await store.listReputationEventsByFilters({ taskId: task.id });
    return c.json({
      task: taskDto(task),
      result: result ? taskResultDto(result) : null,
      settlement_events: settlementEvents.map(settlementEventDto),
      reputation_events: reputationEvents.map(reputationEventDto),
    });
  });

  app.post("/tasks/:taskId/accept", async (c) => c.json(taskDto(await acceptTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId")))));
  app.post("/tasks/:taskId/reject", async (c) => c.json(taskDto(await rejectTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId")))));
  app.post("/tasks/:taskId/expire", async (c) => c.json(taskDto(await expireTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId")))));

  app.post("/tasks/:taskId/result", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const result = await submitResult(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"), {
      result_payload: optionalJsonObject(body, "result_payload"),
      artifacts: optionalArray(body, "artifacts"),
    });
    return c.json(taskResultDto(result), 201);
  });

  app.post("/tasks/:taskId/resolve", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const task = await resolveTask(taskDeps, actorFromHeaders(c.req.raw.headers), c.req.param("taskId"), {
      resolution: requiredResolution(body),
      quality_score: optionalNumber(body, "quality_score"),
      review_score: optionalNumber(body, "review_score"),
    });
    return c.json(taskDto(task));
  });

  app.get("/tasks/:taskId/graph", async (c) => c.json(await getTaskGraph(store, c.req.param("taskId"))));

  app.get("/tasks/:taskId/settlement-events", async (c) =>
    c.json({ settlement_events: (await store.listSettlementEventsByFilters({ taskId: c.req.param("taskId") })).map(settlementEventDto) })
  );

  app.get("/settlement-events", async (c) => {
    const params = new URL(c.req.url).searchParams;
    return c.json({ settlement_events: (await store.listSettlementEventsByFilters({ taskId: queryString(params, "task_id") })).map(settlementEventDto) });
  });

  app.get("/reputation-events", async (c) => {
    const params = new URL(c.req.url).searchParams;
    return c.json({
      reputation_events: (await store.listReputationEventsByFilters({
        taskId: queryString(params, "task_id"),
        agentId: queryString(params, "agent_id"),
      })).map(reputationEventDto),
    });
  });

  return { app, store, taskDeps };
};

const requiredNumber = (body: Record<string, unknown>, field: string): number => {
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(400, "INVALID_BODY", `${field} is required`);
  }
  return value;
};

const notFound = (message: string, request: Request) => ({
  error: {
    code: "NOT_FOUND",
    message,
    details: null,
    path: new URL(request.url).pathname,
  },
});

const createStoreFromEnv = () => {
  if (process.env.OMNICLAW_STORE === "postgres") {
    return createPostgresStore(createDatabaseConnection().db);
  }
  return createMemoryStore();
};
