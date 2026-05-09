import { describe, expect, test } from "bun:test";
import { MockSettlementAdapter } from "../src/adapters/settlement";
import { createApp } from "../src/app";
import { registerAgent, registerSkill } from "../src/services/agents";
import { discoverAgents } from "../src/services/discovery";
import { calculateFees } from "../src/services/fees";
import { acceptTask, createTask, expireTask, getTaskGraph, rejectTask, resolveTask, submitResult } from "../src/services/tasks";
import type { Task } from "../src/types";

const fixture = async () => {
  const ctx = createApp();
  const hirer = await registerAgent(ctx.store, { wallet: "wallet_hirer" }, {
    publisher_wallet: "wallet_hirer",
    name: "Research Coordinator",
    description: "Hires specialist agents",
    reputation_score: 90,
    success_rate: 96,
    quality_score: 88,
    stake_amount: "500000000",
  });
  const worker = await registerAgent(ctx.store, { wallet: "wallet_worker" }, {
    publisher_wallet: "wallet_worker",
    name: "Market Research Agent",
    description: "Performs market research",
    reputation_score: 92,
    success_rate: 97,
    quality_score: 91,
    avg_latency_ms: 4200,
    stake_amount: "500000000",
  });
  const weaker = await registerAgent(ctx.store, { wallet: "wallet_weaker" }, {
    publisher_wallet: "wallet_weaker",
    name: "Slow Research Agent",
    description: "Also researches markets",
    reputation_score: 70,
    success_rate: 72,
    quality_score: 68,
    avg_latency_ms: 11000,
    stake_amount: "1000000",
  });
  const skill = await registerSkill(ctx.store, { wallet: "wallet_worker" }, worker.id, {
    name: "market_research",
    description: "Collects, analyzes, and summarizes market data.",
    input_schema: {},
    output_schema: {},
    base_price_lamports: "50000000",
    estimated_latency_ms: 9000,
    required_permissions: ["web_access"],
  });
  const weakerSkill = await registerSkill(ctx.store, { wallet: "wallet_weaker" }, weaker.id, {
    name: "market_research",
    description: "Slower market data collection.",
    input_schema: {},
    output_schema: {},
    base_price_lamports: "1000000",
    estimated_latency_ms: 12000,
    required_permissions: ["web_access"],
  });
  return { ...ctx, hirer, worker, weaker, skill, weakerSkill };
};

describe("Phase 1 protocol core", () => {
  test("calculates settlement fees at task creation terms", () => {
    expect(calculateFees("100000000")).toEqual({
      paymentLamports: "100000000",
      platformFeeLamports: "2000000",
      runtimeFeeLamports: "1000000",
      workerPayoutLamports: "97000000",
    });
    expect(calculateFees("100000000", { platformFeeBps: 500n, runtimeFeeBps: 0n })).toEqual({
      paymentLamports: "100000000",
      platformFeeLamports: "5000000",
      runtimeFeeLamports: "0",
      workerPayoutLamports: "95000000",
    });
  });

  test("discovers agents with filters and ranking metadata", async () => {
    const { store, worker } = await fixture();
    const results = await discoverAgents(store, {
      capability: "market_research",
      reputation_gt: "80",
      latency_lt_ms: "10000",
      max_price_lamports: "60000000",
      status: "active",
    });
    expect(results).toHaveLength(1);
    expect(results[0].agent.id).toBe(worker.id);
    expect(results[0].ranking.score).toBeGreaterThan(0);
    expect(results[0].ranking.skillMatch).toBe(100);
  });

  test("allows discovery ranking weights to be tuned without changing business logic", async () => {
    const { store, weaker } = await fixture();
    const results = await discoverAgents(store, { capability: "market_research" }, {
      exactSkillMatchScore: 100,
      descriptionSkillMatchScore: 65,
      maxComponentScore: 100,
      lamportsPerPricePoint: 1_000_000n,
      lamportsPerStakePoint: 1_000_000n,
      weights: {
        skillMatch: 0,
        reputation: 0,
        successRate: 0,
        quality: 0,
        latency: 0,
        price: 1,
        stake: 0,
      },
    });
    expect(results[0].agent.id).toBe(weaker.id);
    expect(results[0].ranking.price).toBeGreaterThan(results[1].ranking.price);
  });

  test("runs the repository-backed full task flow through settlement and reputation", async () => {
    const { store, taskDeps, hirer, worker, skill } = await fixture();
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: { query: "Collect BONK sentiment data" },
      payment_lamports: "50000000",
      deadline: future(),
    });
    expect(task.status).toBe("escrow_locked");
    expect((await store.listSettlementEvents()).map((event) => event.eventType)).toContain("escrow_locked");

    await acceptTask(taskDeps, { agentId: worker.id }, task.id);
    expect((await store.getTask(task.id))?.status).toBe("in_progress");
    await submitResult(taskDeps, { agentId: worker.id }, task.id, {
      result_payload: { summary: "positive" },
      artifacts: [],
    });
    expect((await store.getTask(task.id))?.status).toBe("submitted");

    await resolveTask(taskDeps, { agentId: hirer.id }, task.id, {
      resolution: "completed",
      quality_score: 91,
      review_score: 5,
    });
    expect((await store.getTask(task.id))?.status).toBe("completed");
    expect((await store.listSettlementEvents()).map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["worker_paid", "platform_fee_paid", "runtime_fee_paid"]),
    );
    expect(await store.listReputationEvents()).toHaveLength(1);
  });

  test("rejecting an escrowed task refunds hirer and does not pay worker", async () => {
    const { store, taskDeps, hirer, worker, skill } = await fixture();
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    });
    await rejectTask(taskDeps, { agentId: worker.id }, task.id);
    expect(store.tasks.get(task.id)?.status).toBe("cancelled");
    expect([...store.settlementEvents.values()].map((event) => event.eventType)).toContain("hirer_refunded");
    expect([...store.settlementEvents.values()].map((event) => event.eventType)).not.toContain("worker_paid");
  });

  test("keeps mock settlement account names configurable behind the adapter", async () => {
    const { store, taskDeps, hirer, worker, skill } = await fixture();
    taskDeps.settlement = new MockSettlementAdapter({
      escrowAccountPrefix: "test_escrow",
      lockTxPrefix: "test_lock",
      payoutTxPrefix: "test_payout",
      refundTxPrefix: "test_refund",
      protocolFeeWallet: "test_protocol_fee",
      runtimeFeeWallet: "test_runtime_fee",
    }, store.now);
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    });
    expect(task.escrowAccount).toBe(`test_escrow_${task.id}`);
    await acceptTask(taskDeps, { agentId: worker.id }, task.id);
    await submitResult(taskDeps, { agentId: worker.id }, task.id, { result_payload: {}, artifacts: [] });
    await resolveTask(taskDeps, { agentId: hirer.id }, task.id, { resolution: "completed" });
    expect([...store.settlementEvents.values()].map((event) => event.toWallet)).toEqual(
      expect.arrayContaining(["test_protocol_fee", "test_runtime_fee"]),
    );
  });

  test("exposes the integrated Solana Anchor contract boundary", async () => {
    const { app } = createApp();
    const response = await get(app, "/settlement/solana");

    expect(response).toMatchObject({
      settlement_mode: "mock",
      configured_settlement_adapter: "mock",
      program_id: "292wuc4zRvyEk1of5Ek8EDMtH9oRjbU1HKaoNTRWm3fv",
      cluster: "localnet",
      rpc_url: "http://127.0.0.1:8899",
      contract_path: "contracts/solana",
      frontend_helper: "contracts/solana/app/omniclawClient.ts",
      anchor_commands: {
        build: "bun run chain:build",
        test: "bun run chain:test",
        typecheck: "bun run chain:typecheck",
      },
    });
    expect(response.instructions).toEqual(["register_agent", "create_job", "submit_work", "complete_job", "cancel_job", "slash_agent"]);
    expect(response.job_statuses).toContainEqual({ value: 2, label: "completed", api_status: "completed" });
  });

  test("enforces worker and hirer authorization rules", async () => {
    const { store, taskDeps, hirer, worker, weaker, skill } = await fixture();
    await expect(registerSkill(store, { wallet: "wallet_intruder" }, worker.id, {
      name: "unauthorized_skill",
      description: "Should not register",
      base_price_lamports: "1",
      estimated_latency_ms: 1,
      required_permissions: [],
    })).rejects.toThrow("publisher wallet authorization required");
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    });
    await expect(createTask(taskDeps, { agentId: weaker.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    })).rejects.toThrow("hirer authorization required");
    await expect(submitResult(taskDeps, { agentId: worker.id }, task.id, { result_payload: {}, artifacts: [] })).rejects.toThrow(
      "result can only be submitted for in_progress tasks",
    );
    await expect(acceptTask(taskDeps, { agentId: weaker.id }, task.id)).rejects.toThrow("worker authorization required");
    await acceptTask(taskDeps, { agentId: worker.id }, task.id);
    await submitResult(taskDeps, { agentId: worker.id }, task.id, { result_payload: {}, artifacts: [] });
    await expect(resolveTask(taskDeps, { agentId: weaker.id }, task.id, { resolution: "completed" })).rejects.toThrow(
      "hirer, evaluator, or admin authorization required",
    );
  });

  test("builds a coordination graph from parent_task_id", async () => {
    const { store, taskDeps, hirer, worker, weaker, skill, weakerSkill } = await fixture();
    const parent = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: { topic: "SOL" },
      payment_lamports: "100000000",
      deadline: future(120),
    });
    const child = await createTask(taskDeps, { agentId: worker.id }, {
      parent_task_id: parent.id,
      hirer_agent_id: worker.id,
      worker_agent_id: weaker.id,
      skill_id: weakerSkill.id,
      task_payload: { topic: "SOL social data" },
      payment_lamports: "25000000",
      deadline: future(60),
    });
    const graph = await getTaskGraph(store, child.id);
    expect(graph.rootTaskId).toBe(parent.id);
    expect(graph.nodes.map((node) => node.taskId)).toEqual(expect.arrayContaining([parent.id, child.id]));
    expect(graph.edges).toContainEqual({ from: parent.id, to: child.id });
  });

  test("rejects invalid coordination graph parent deadlines and cycles", async () => {
    const { store, taskDeps, hirer, worker, weaker, skill, weakerSkill } = await fixture();
    const parent = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "100000000",
      deadline: future(30),
    });
    await expect(createTask(taskDeps, { agentId: worker.id }, {
      parent_task_id: parent.id,
      hirer_agent_id: worker.id,
      worker_agent_id: weaker.id,
      skill_id: weakerSkill.id,
      task_payload: {},
      payment_lamports: "25000000",
      deadline: future(60),
    })).rejects.toThrow("child deadline cannot exceed parent deadline");

    const child = await createTask(taskDeps, { agentId: worker.id }, {
      parent_task_id: parent.id,
      hirer_agent_id: worker.id,
      worker_agent_id: weaker.id,
      skill_id: weakerSkill.id,
      task_payload: {},
      payment_lamports: "25000000",
      deadline: future(20),
    });
    parent.parentTaskId = child.id;
    await store.saveTask(parent);
    await expect(getTaskGraph(store, child.id)).rejects.toThrow("task graph cycle detected");
  });

  test("validates task result payloads against skill output JSON schema", async () => {
    const { store, taskDeps, hirer, worker } = await fixture();
    const schemaSkill = await registerSkill(store, { wallet: "wallet_worker" }, worker.id, {
      name: "structured_report",
      description: "Returns a typed report.",
      output_schema: {
        type: "object",
        required: ["summary", "score"],
        properties: {
          summary: { type: "string" },
          score: { type: "number" },
        },
      },
      base_price_lamports: "50000000",
      estimated_latency_ms: 9000,
      required_permissions: [],
    });
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: schemaSkill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    });
    await acceptTask(taskDeps, { agentId: worker.id }, task.id);
    await expect(submitResult(taskDeps, { agentId: worker.id }, task.id, {
      result_payload: { summary: "ok" },
      artifacts: [],
    })).rejects.toThrow("result_payload does not match schema");
    await expect(submitResult(taskDeps, { agentId: worker.id }, task.id, {
      result_payload: { summary: "ok", score: "high" },
      artifacts: [],
    })).rejects.toThrow("result_payload does not match schema");
    const result = await submitResult(taskDeps, { agentId: worker.id }, task.id, {
      result_payload: { summary: "ok", score: 92 },
      artifacts: [],
    });
    expect(result.resultPayload).toEqual({ summary: "ok", score: 92 });
  });

  test("expires overdue tasks with refund before submission and dispute after submission", async () => {
    const { store, taskDeps, hirer, worker, skill } = await fixture();
    const unsubmitted = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(1),
    });
    store.now = () => future(2);
    const expired = await expireTask(taskDeps, { role: "admin" }, unsubmitted.id);
    expect(expired.status).toBe("expired");
    expect((await store.listSettlementEvents()).map((event) => event.eventType)).toContain("hirer_refunded");

    const submitted = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(3),
    });
    await acceptTask(taskDeps, { agentId: worker.id }, submitted.id);
    await submitResult(taskDeps, { agentId: worker.id }, submitted.id, { result_payload: {}, artifacts: [] });
    store.now = () => future(4);
    const disputed = await expireTask(taskDeps, { role: "admin" }, submitted.id);
    expect(disputed.status).toBe("disputed");
  });

  test("keeps mock settlement operations idempotent and records failure reasons", async () => {
    const { taskDeps, hirer, worker, skill } = await fixture();
    const settlement = new MockSettlementAdapter(undefined, () => "2026-05-08T00:00:00.000Z");
    const task = await createTask({ ...taskDeps, settlement }, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    });
    expect((await settlement.lockEscrow(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet })).events).toHaveLength(0);

    const payout = await settlement.releasePayout(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet });
    expect(payout.events.map((event) => event.eventType)).toContain("worker_paid");
    expect((await settlement.releasePayout(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet })).events).toHaveLength(0);

    const refundTask = { ...task, id: `${task.id}_refund` };
    expect((await settlement.refund(refundTask, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet })).events).toHaveLength(1);
    expect((await settlement.refund(refundTask, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet })).events).toHaveLength(0);

    const failure = await settlement.recordFailure(task, "simulated chain rejection");
    expect(failure.events[0]).toMatchObject({
      eventType: "settlement_failed",
      failureReason: "simulated chain rejection",
    });
  });

  test("marks accepted tasks failed when runtime dispatch fails", async () => {
    const { store, taskDeps, hirer, worker, skill } = await fixture();
    taskDeps.runtime = {
      async dispatch() {
        throw new Error("runtime down");
      },
    };
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    });

    await expect(acceptTask(taskDeps, { agentId: worker.id }, task.id)).rejects.toThrow("runtime down");
    expect((await store.getTask(task.id))?.status).toBe("failed");
  });

  test("records settlement_failed event when payout settlement throws", async () => {
    const { store, taskDeps, hirer, worker, skill } = await fixture();
    taskDeps.settlement = new ThrowingPayoutSettlementAdapter(undefined, store.now);
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: {},
      payment_lamports: "50000000",
      deadline: future(),
    });
    await acceptTask(taskDeps, { agentId: worker.id }, task.id);
    await submitResult(taskDeps, { agentId: worker.id }, task.id, { result_payload: {}, artifacts: [] });

    await expect(resolveTask(taskDeps, { agentId: hirer.id }, task.id, { resolution: "completed" })).rejects.toThrow("chain down");
    expect((await store.getTask(task.id))?.status).toBe("submitted");
    expect((await store.listSettlementEvents()).filter((event) => event.eventType === "settlement_failed")).toEqual([
      expect.objectContaining({
        failureReason: "release payout failed: chain down",
      }),
    ]);
  });

  test("covers the repository contract used by services", async () => {
    const { store, hirer, worker, skill } = await fixture();
    expect(await store.getAgent(hirer.id)).toEqual(hirer);
    expect(await store.findSkillByAgentName(worker.id, skill.name)).toEqual(skill);
    expect((await store.listAgents()).map((agent) => agent.id)).toEqual(expect.arrayContaining([hirer.id, worker.id]));
    expect((await store.listSkills()).map((storedSkill) => storedSkill.id)).toContain(skill.id);
    expect((await store.listTasksByFilters({ workerAgentId: worker.id }))).toEqual([]);
    expect((await store.listSettlementEventsByFilters({ taskId: "missing" }))).toEqual([]);
    expect((await store.listReputationEventsByFilters({ agentId: worker.id }))).toEqual([]);
  });

  test("exposes SDK-ready Hono API routes with DTOs, filters, detail, and event queries", async () => {
    const { app } = createApp();
    const hirer = await post(app, "/agents", { publisher_wallet: "wallet_api_hirer", name: "API Hirer", description: "Creates work" }, {
      "x-wallet": "wallet_api_hirer",
    });
    const worker = await post(app, "/agents", { publisher_wallet: "wallet_api_worker", name: "API Worker", description: "Does work" }, {
      "x-wallet": "wallet_api_worker",
    });
    expect(hirer.agent_id).toStartWith("agent_");
    expect(worker.publisherWallet).toBeUndefined();

    const skill = await post(app, `/agents/${worker.agent_id}/skills`, {
      name: "report_generation",
      description: "Writes short reports",
      input_schema: { type: "object", required: ["topic"], properties: { topic: { type: "string" } } },
      output_schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
      base_price_lamports: "10000000",
      estimated_latency_ms: 1000,
      required_permissions: [],
    }, { "x-wallet": "wallet_api_worker" });

    const discovery = await get(app, "/agents/discover?capability=report_generation&status=active");
    expect(discovery.results).toHaveLength(1);
    expect(discovery.results[0].agent.agent_id).toBe(worker.agent_id);

    const task = await post(app, "/tasks", {
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "OmniClaw" },
      payment_lamports: "10000000",
      deadline: future(),
    }, { "x-agent-id": hirer.agent_id });
    expect(task.status).toBe("escrow_locked");
    expect(task.task_id).toStartWith("task_");

    const listByWorker = await get(app, `/tasks?worker_agent_id=${worker.agent_id}&status=escrow_locked&deadline_from=${encodeURIComponent(future(-1))}`);
    expect(listByWorker.tasks.map((listed: { task_id: string }) => listed.task_id)).toContain(task.task_id);

    const accepted = await post(app, `/tasks/${task.task_id}/accept`, {}, { "x-agent-id": worker.agent_id });
    expect(accepted.status).toBe("in_progress");
    const result = await post(app, `/tasks/${task.task_id}/result`, { result_payload: { ok: true }, artifacts: [] }, { "x-agent-id": worker.agent_id });
    expect(result.task_id).toBe(task.task_id);
    const resolved = await post(app, `/tasks/${task.task_id}/resolve`, { resolution: "completed", quality_score: 90, review_score: 5 }, {
      "x-agent-id": hirer.agent_id,
    });
    expect(resolved.status).toBe("completed");
    const detail = await get(app, `/tasks/${task.task_id}`);
    expect(detail.task.task_id).toBe(task.task_id);
    expect(detail.result.result_payload).toEqual({ ok: true });
    expect(detail.settlement_events.map((event: { event_type: string }) => event.event_type)).toEqual(
      expect.arrayContaining(["escrow_locked", "worker_paid", "platform_fee_paid", "runtime_fee_paid"]),
    );
    expect(detail.reputation_events).toHaveLength(1);

    const settlementTimeline = await get(app, `/tasks/${task.task_id}/settlement-events`);
    expect(settlementTimeline.settlement_events[0].task_id).toBe(task.task_id);
    const reputation = await get(app, `/reputation-events?agent_id=${worker.agent_id}`);
    expect(reputation.reputation_events[0].agent_id).toBe(worker.agent_id);
    const graph = await get(app, `/tasks/${task.task_id}/graph`);
    expect(graph.rootTaskId).toBe(task.task_id);
  });

  test("standardizes API validation and schema errors", async () => {
    const { app } = createApp();
    const invalidJson = await app.request("/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toMatchObject({
      error: { code: "INVALID_JSON", path: "/agents" },
    });

    const invalidQuery = await app.request("/tasks?deadline_from=not-a-date");
    expect(invalidQuery.status).toBe(400);
    expect(await invalidQuery.json()).toMatchObject({
      error: { code: "INVALID_QUERY", path: "/tasks" },
    });
    const invalidHeader = await app.request("/agents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-role": "root" },
      body: JSON.stringify({ publisher_wallet: "wallet_bad_role", name: "Bad Role", description: "Invalid header" }),
    });
    expect(invalidHeader.status).toBe(400);
    expect(await invalidHeader.json()).toMatchObject({
      error: { code: "INVALID_HEADER", path: "/agents", details: { header: "x-role" } },
    });

    const hirer = await post(app, "/agents", { publisher_wallet: "wallet_schema_hirer", name: "Schema Hirer", description: "Creates work" }, {
      "x-wallet": "wallet_schema_hirer",
    });
    const worker = await post(app, "/agents", { publisher_wallet: "wallet_schema_worker", name: "Schema Worker", description: "Does work" }, {
      "x-wallet": "wallet_schema_worker",
    });
    const skill = await post(app, `/agents/${worker.agent_id}/skills`, {
      name: "typed_input",
      description: "Requires a typed input",
      input_schema: { type: "object", required: ["topic"], properties: { topic: { type: "string" } } },
      output_schema: {},
      base_price_lamports: "10000000",
      estimated_latency_ms: 1000,
      required_permissions: [],
    }, { "x-wallet": "wallet_schema_worker" });
    const schemaFailure = await app.request("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-id": hirer.agent_id },
      body: JSON.stringify({
        hirer_agent_id: hirer.agent_id,
        worker_agent_id: worker.agent_id,
        skill_id: skill.skill_id,
        task_payload: { topic: 42 },
        payment_lamports: "10000000",
        deadline: future(),
      }),
    });
    expect(schemaFailure.status).toBe(400);
    expect(await schemaFailure.json()).toMatchObject({
      error: {
        code: "SCHEMA_VALIDATION_FAILED",
        path: "/tasks",
        details: [{ path: "task_payload.topic", message: "must be string" }],
      },
    });
  });

  test("surfaces runtime dispatch failure through API while preserving task audit state", async () => {
    const { app, taskDeps } = createApp();
    taskDeps.runtime = {
      async dispatch() {
        throw new Error("runtime down");
      },
    };
    const { hirer, worker, skill } = await apiFixture(app, "runtime");
    const task = await post(app, "/tasks", {
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: {},
      payment_lamports: "10000000",
      deadline: future(),
    }, { "x-agent-id": hirer.agent_id });
    const failedAccept = await app.request(`/tasks/${task.task_id}/accept`, { method: "POST", headers: { "x-agent-id": worker.agent_id } });
    expect(failedAccept.status).toBe(500);
    const detail = await get(app, `/tasks/${task.task_id}`);
    expect(detail.task.status).toBe("failed");
  });

  test("surfaces settlement failure audit through API detail and timeline", async () => {
    const { app, taskDeps, store } = createApp();
    taskDeps.settlement = new ThrowingPayoutSettlementAdapter(undefined, store.now);
    const { hirer, worker, skill } = await apiFixture(app, "settlement");
    const task = await post(app, "/tasks", {
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: {},
      payment_lamports: "10000000",
      deadline: future(),
    }, { "x-agent-id": hirer.agent_id });
    await post(app, `/tasks/${task.task_id}/accept`, {}, { "x-agent-id": worker.agent_id });
    await post(app, `/tasks/${task.task_id}/result`, { result_payload: {}, artifacts: [] }, { "x-agent-id": worker.agent_id });
    const failedResolve = await app.request(`/tasks/${task.task_id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-id": hirer.agent_id },
      body: JSON.stringify({ resolution: "completed" }),
    });
    expect(failedResolve.status).toBe(500);
    const timeline = await get(app, `/tasks/${task.task_id}/settlement-events`);
    expect(timeline.settlement_events).toContainEqual(expect.objectContaining({
      event_type: "settlement_failed",
      failure_reason: "release payout failed: chain down",
    }));
    const detail = await get(app, `/tasks/${task.task_id}`);
    expect(detail.task.status).toBe("submitted");
  });
});

const future = (minutes = 60) => new Date(Date.now() + minutes * 60_000).toISOString();

class ThrowingPayoutSettlementAdapter extends MockSettlementAdapter {
  async releasePayout(_task: Task, _wallets: { hirerWallet: string; workerWallet: string }): Promise<never> {
    throw new Error("chain down");
  }
}

const post = async (app: ReturnType<typeof createApp>["app"], path: string, body: unknown, headers: Record<string, string> = {}) => {
  const response = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  expect(response.status).toBeLessThan(400);
  return response.json();
};

const get = async (app: ReturnType<typeof createApp>["app"], path: string) => {
  const response = await app.request(path);
  expect(response.status).toBeLessThan(400);
  return response.json();
};

const apiFixture = async (app: ReturnType<typeof createApp>["app"], suffix: string) => {
  const hirer = await post(app, "/agents", {
    publisher_wallet: `wallet_${suffix}_hirer`,
    name: `${suffix} Hirer`,
    description: "Creates work",
  }, { "x-wallet": `wallet_${suffix}_hirer` });
  const worker = await post(app, "/agents", {
    publisher_wallet: `wallet_${suffix}_worker`,
    name: `${suffix} Worker`,
    description: "Does work",
  }, { "x-wallet": `wallet_${suffix}_worker` });
  const skill = await post(app, `/agents/${worker.agent_id}/skills`, {
    name: `${suffix}_skill`,
    description: "Does protocol work",
    input_schema: {},
    output_schema: {},
    base_price_lamports: "10000000",
    estimated_latency_ms: 1000,
    required_permissions: [],
  }, { "x-wallet": `wallet_${suffix}_worker` });
  return { hirer, worker, skill };
};
