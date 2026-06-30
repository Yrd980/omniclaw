import { createDatabaseConnection } from "@omniclaw/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRuntimeAdapterFromEnv } from "./adapters/runtime-factory";
import { createSettlementAdapter } from "./adapters/settlement";
import {
  assertProductionReadyConfig,
  DEFAULT_DISCOVERY_RANKING_CONFIG,
  runtimeConfigFromEnv,
  type DiscoveryRankingConfig,
  type RuntimeConfig,
} from "./config";
import { agentDto, artifactCheckDto, deliveryManifestDto, disputeDto, executionQueueItemDto, reputationEventDto, settlementEventDto, skillDto, taskDto, taskResultDto } from "./dto";
import { ApiError, invariant } from "./errors";
import { rateLimit, type RateLimitConfig } from "./middleware/rate-limit";
import { createPostgresStore } from "./postgres-store";
import { createMemoryStore, type DataStore } from "./store";
import { taskContractDto, taskProofDto } from "./task-contracts";
import { registerAgent, registerSkill } from "./services/agents";
import { actorFromHeaders } from "./services/authorization";
import { discoverAgents } from "./services/discovery";
import { submitManifest, getManifest } from "./services/manifest";
import { runVerifier } from "./services/verifier";
import { openDispute, resolveDispute, listDisputes, assignEvaluator } from "./services/disputes";
import { getSettlementFailures, retrySettlementEvent, getAgentSuspensions, suspendAgent, reactivateAgent, getOperatorStats } from "./services/operator";
import { getArtifactSafetySummary } from "./services/artifact-safety";
import { getExecutionQueue, enqueueTask, cancelExecution, getStuckExecutions, cleanupTimedOutExecutions } from "./services/execution";
import { generateNonce, verifySiws } from "./services/siws";
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
  requiredDisputeResolution,
  requiredResolution,
} from "./validation";

export type AppEnv = {
  store: DataStore;
  taskDeps: TaskServiceDeps;
  discoveryRanking: DiscoveryRankingConfig;
  runtimeConfig: RuntimeConfig;
};

export const createApp = (env: Partial<AppEnv> = {}) => {
  const runtimeConfig = env.runtimeConfig ?? runtimeConfigFromEnv();
  assertProductionReadyConfig(runtimeConfig);
  const store = env.store ?? createStoreFromEnv(runtimeConfig);
  const taskDeps = env.taskDeps ?? {
    store,
    settlement: createSettlementAdapter(),
    runtime: createRuntimeAdapterFromEnv(),
  };
  const discoveryRanking = env.discoveryRanking ?? DEFAULT_DISCOVERY_RANKING_CONFIG;
  const app = new Hono();

  app.use("*", cors({
    origin: "*",
    allowHeaders: ["content-type", "x-wallet", "x-agent-id", "x-role", "x-siws-message", "x-siws-signature", "x-siws-address"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }));

  const rateLimitConfig: RateLimitConfig = {
    windowMs: Number(process.env.OMNICLAW_RATE_LIMIT_WINDOW_MS ?? "60000"),
    maxRequests: Number(process.env.OMNICLAW_RATE_LIMIT_MAX_REQUESTS ?? "100"),
  };
  app.use("*", rateLimit(rateLimitConfig));

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

  app.get("/health", (c) => c.json({
    ok: true,
    environment: runtimeConfig.environment,
    store: runtimeConfig.storeMode,
    runtime_adapter: runtimeConfig.runtimeAdapterMode,
    settlement_adapter: runtimeConfig.settlementAdapterMode,
    auth_mode: runtimeConfig.authMode,
    production_ready: runtimeConfig.productionReady,
    warnings: runtimeConfig.warnings,
  }));

  app.post("/agents", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const agent = await registerAgent(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), {
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
    const skill = await registerSkill(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("agentId"), {
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
    const task = await createTask(taskDeps, await actorFromHeaders(c.req.raw.headers, runtimeConfig), {
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
      task_contract: taskContractDto(task),
      proof: taskProofDto(task, result, settlementEvents, reputationEvents),
      result: result ? taskResultDto(result) : null,
      settlement_events: settlementEvents.map(settlementEventDto),
      reputation_events: reputationEvents.map(reputationEventDto),
    });
  });

  app.post("/tasks/:taskId/accept", async (c) => c.json(taskDto(await acceptTask(taskDeps, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("taskId")))));
  app.post("/tasks/:taskId/reject", async (c) => c.json(taskDto(await rejectTask(taskDeps, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("taskId")))));
  app.post("/tasks/:taskId/expire", async (c) => c.json(taskDto(await expireTask(taskDeps, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("taskId")))));

  app.post("/tasks/:taskId/result", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const result = await submitResult(taskDeps, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("taskId"), {
      result_payload: optionalJsonObject(body, "result_payload"),
      artifacts: optionalArray(body, "artifacts"),
    });
    return c.json(taskResultDto(result), 201);
  });

  app.post("/tasks/:taskId/resolve", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const task = await resolveTask(taskDeps, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("taskId"), {
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

  app.post("/tasks/:taskId/manifest", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const manifest = await submitManifest(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("taskId"), {
      manifest_payload: requireString(body, "manifest_payload") as unknown as Record<string, unknown>,
      public_safe: optionalString(body, "public_safe") === "true",
      inputs: body.inputs as any,
      outputs: body.outputs as any,
      verifier: body.verifier as any,
      verification_timeout_ms: optionalNumber(body, "verification_timeout_ms"),
    });
    return c.json(deliveryManifestDto(manifest), 201);
  });

  app.get("/tasks/:taskId/manifest", async (c) => {
    const manifest = await getManifest(store, c.req.param("taskId"));
    return manifest ? c.json(deliveryManifestDto(manifest)) : c.json({ manifest: null });
  });

  app.post("/tasks/:taskId/verify", async (c) => {
    const manifest = await getManifest(store, c.req.param("taskId"));
    if (!manifest) {
      return c.json({ error: { code: "NOT_FOUND", message: "no manifest found for task", details: null, path: c.req.url } }, 404);
    }
    const result = await runVerifier(store, manifest);
    return c.json({ status: result.status, exit_code: result.exitCode, stdout: result.stdout });
  });

  app.get("/tasks/:taskId/artifact-checks", async (c) => {
    const checks = await store.listArtifactChecksByTaskId(c.req.param("taskId"));
    return c.json({ artifact_checks: checks.map(artifactCheckDto) });
  });

  app.get("/tasks/:taskId/proof", async (c) => {
    const task = await store.getTask(c.req.param("taskId"));
    if (!task) {
      return c.json({ error: { code: "NOT_FOUND", message: "task not found", details: null, path: c.req.url } }, 404);
    }
    const result = await store.getTaskResultForTask(task.id);
    const settlementEvents = await store.listSettlementEventsByFilters({ taskId: task.id });
    const reputationEvents = await store.listReputationEventsByFilters({ taskId: task.id });
    const manifest = await store.getDeliveryManifestByTaskId(task.id);
    const disputes = await store.listDisputes({ taskId: task.id });
    const artifactChecks = await store.listArtifactChecksByTaskId(task.id);
    return c.json({
      proof: taskProofDto(task, result, settlementEvents, reputationEvents),
      delivery_manifest: manifest ? deliveryManifestDto(manifest) : null,
      disputes: disputes.map(disputeDto),
      artifact_checks: artifactChecks.map(artifactCheckDto),
    });
  });

  app.post("/tasks/:taskId/disputes", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const dispute = await openDispute(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("taskId"), {
      reason: requireString(body, "reason"),
    });
    return c.json(disputeDto(dispute), 201);
  });

  app.get("/tasks/:taskId/detail", async (c) => {
    const task = await store.getTask(c.req.param("taskId"));
    if (!task) {
      return c.json({ error: { code: "NOT_FOUND", message: "task not found", details: null, path: c.req.url } }, 404);
    }
    const result = await store.getTaskResultForTask(task.id);
    const settlementEvents = await store.listSettlementEventsByFilters({ taskId: task.id });
    const reputationEvents = await store.listReputationEventsByFilters({ taskId: task.id });
    const manifest = await store.getDeliveryManifestByTaskId(task.id);
    const disputes = await store.listDisputes({ taskId: task.id });
    const artifactChecks = await store.listArtifactChecksByTaskId(task.id);
    return c.json({
      task: taskDto(task),
      task_contract: taskContractDto(task),
      proof: taskProofDto(task, result, settlementEvents, reputationEvents),
      delivery_manifest: manifest ? deliveryManifestDto(manifest) : null,
      result: result ? taskResultDto(result) : null,
      settlement_events: settlementEvents.map(settlementEventDto),
      reputation_events: reputationEvents.map(reputationEventDto),
      disputes: disputes.map(disputeDto),
      artifact_checks: artifactChecks.map(artifactCheckDto),
    });
  });

  app.get("/disputes", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const disputes = await listDisputes(store, {
      task_id: queryString(params, "task_id"),
      status: queryString(params, "status"),
      evaluator_agent_id: queryString(params, "evaluator_agent_id"),
    });
    return c.json({ disputes: disputes.map(disputeDto) });
  });

  app.post("/disputes/:disputeId/resolve", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const dispute = await resolveDispute(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("disputeId"), {
      resolution: requiredDisputeResolution(body),
      resolution_notes: optionalString(body, "resolution_notes"),
      settlement_action: optionalString(body, "settlement_action") as any,
      quality_score: optionalNumber(body, "quality_score"),
      review_score: optionalNumber(body, "review_score"),
    });
    return c.json(disputeDto(dispute));
  });

  app.post("/disputes/:disputeId/assign", async (c) => {
    const dispute = await assignEvaluator(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("disputeId"));
    return c.json(disputeDto(dispute));
  });

  app.get("/operator/settlement-failures", async (c) => {
    const failures = await getSettlementFailures(store);
    return c.json({ failures });
  });

  app.post("/operator/settlement-events/:eventId/retry", async (c) => {
    const result = await retrySettlementEvent(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("eventId"));
    return c.json(result);
  });

  app.get("/operator/agent-suspensions", async (c) => {
    const agents = await getAgentSuspensions(store);
    return c.json({ agents });
  });

  app.post("/operator/agents/:agentId/suspend", async (c) => {
    const agent = await suspendAgent(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("agentId"));
    return c.json(agentDto(agent));
  });

  app.post("/operator/agents/:agentId/reactivate", async (c) => {
    const agent = await reactivateAgent(store, await actorFromHeaders(c.req.raw.headers, runtimeConfig), c.req.param("agentId"));
    return c.json(agentDto(agent));
  });

  app.get("/operator/stats", async (c) => {
    const stats = await getOperatorStats(store);
    return c.json(stats);
  });

  app.get("/operator/execution-queue", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const queue = await getExecutionQueue(store, {
      task_id: queryString(params, "task_id"),
      status: queryString(params, "status"),
    });
    return c.json({ queue: queue.map(executionQueueItemDto) });
  });

  app.get("/operator/stuck-executions", async (c) => {
    const stuck = await getStuckExecutions(store);
    return c.json({ stuck: stuck.map(executionQueueItemDto) });
  });

  app.post("/operator/cleanup-timed-out", async (c) => {
    const cleaned = await cleanupTimedOutExecutions(store);
    return c.json({ cleaned });
  });

  app.get("/operator/artifact-safety/:taskId", async (c) => {
    const summary = await getArtifactSafetySummary(store, c.req.param("taskId"));
    return c.json(summary);
  });

  app.get("/auth/nonce", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const address = queryString(params, "address");
    invariant(address, 400, "INVALID_BODY", "address is required");
    const nonceData = generateNonce(address);
    return c.json(nonceData);
  });

  app.post("/auth/verify", async (c) => {
    const body = await readJsonObjectBody(c.req.raw);
    const result = await verifySiws(store, {
      message: requireString(body, "message"),
      signature: requireString(body, "signature"),
      address: requireString(body, "address"),
    });
    return c.json(result);
  });

  return { app, store, taskDeps, runtimeConfig };
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

const createStoreFromEnv = (config: RuntimeConfig) => {
  if (config.storeMode === "postgres") {
    return createPostgresStore(createDatabaseConnection().db);
  }
  return createMemoryStore();
};
