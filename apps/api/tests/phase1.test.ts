import { describe, expect, test } from "bun:test";
import { MockSettlementAdapter } from "../src/adapters/settlement";
import { createApp } from "../src/app";
import { registerAgent, registerSkill } from "../src/services/agents";
import { discoverAgents } from "../src/services/discovery";
import { calculateFees } from "../src/services/fees";
import { acceptTask, createTask, getTaskGraph, rejectTask, resolveTask, submitResult } from "../src/services/tasks";

const fixture = () => {
  const ctx = createApp();
  const hirer = registerAgent(ctx.store, { wallet: "wallet_hirer" }, {
    publisher_wallet: "wallet_hirer",
    name: "Research Coordinator",
    description: "Hires specialist agents",
    reputation_score: 90,
    success_rate: 96,
    quality_score: 88,
    stake_amount: "500000000",
  });
  const worker = registerAgent(ctx.store, { wallet: "wallet_worker" }, {
    publisher_wallet: "wallet_worker",
    name: "Market Research Agent",
    description: "Performs market research",
    reputation_score: 92,
    success_rate: 97,
    quality_score: 91,
    avg_latency_ms: 4200,
    stake_amount: "500000000",
  });
  const weaker = registerAgent(ctx.store, { wallet: "wallet_weaker" }, {
    publisher_wallet: "wallet_weaker",
    name: "Slow Research Agent",
    description: "Also researches markets",
    reputation_score: 70,
    success_rate: 72,
    quality_score: 68,
    avg_latency_ms: 11000,
    stake_amount: "1000000",
  });
  const skill = registerSkill(ctx.store, { wallet: "wallet_worker" }, worker.id, {
    name: "market_research",
    description: "Collects, analyzes, and summarizes market data.",
    input_schema: {},
    output_schema: {},
    base_price_lamports: "50000000",
    estimated_latency_ms: 9000,
    required_permissions: ["web_access"],
  });
  const weakerSkill = registerSkill(ctx.store, { wallet: "wallet_weaker" }, weaker.id, {
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

  test("discovers agents with filters and ranking metadata", () => {
    const { store, worker } = fixture();
    const results = discoverAgents(store, {
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

  test("allows discovery ranking weights to be tuned without changing business logic", () => {
    const { store, weaker } = fixture();
    const results = discoverAgents(store, { capability: "market_research" }, {
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

  test("runs the core task state machine through settlement and reputation", async () => {
    const { store, taskDeps, hirer, worker, skill } = fixture();
    const task = await createTask(taskDeps, { agentId: hirer.id }, {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: { query: "Collect BONK sentiment data" },
      payment_lamports: "50000000",
      deadline: future(),
    });
    expect(task.status).toBe("escrow_locked");
    expect([...store.settlementEvents.values()].map((event) => event.eventType)).toContain("escrow_locked");

    await acceptTask(taskDeps, { agentId: worker.id }, task.id);
    expect(store.tasks.get(task.id)?.status).toBe("in_progress");
    submitResult(taskDeps, { agentId: worker.id }, task.id, {
      result_payload: { summary: "positive" },
      artifacts: [],
    });
    expect(store.tasks.get(task.id)?.status).toBe("submitted");

    await resolveTask(taskDeps, { agentId: hirer.id }, task.id, {
      resolution: "completed",
      quality_score: 91,
      review_score: 5,
    });
    expect(store.tasks.get(task.id)?.status).toBe("completed");
    expect([...store.settlementEvents.values()].map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["worker_paid", "platform_fee_paid", "runtime_fee_paid"]),
    );
    expect([...store.reputationEvents.values()]).toHaveLength(1);
  });

  test("rejecting an escrowed task refunds hirer and does not pay worker", async () => {
    const { store, taskDeps, hirer, worker, skill } = fixture();
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
    const { store, taskDeps, hirer, worker, skill } = fixture();
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
    submitResult(taskDeps, { agentId: worker.id }, task.id, { result_payload: {}, artifacts: [] });
    await resolveTask(taskDeps, { agentId: hirer.id }, task.id, { resolution: "completed" });
    expect([...store.settlementEvents.values()].map((event) => event.toWallet)).toEqual(
      expect.arrayContaining(["test_protocol_fee", "test_runtime_fee"]),
    );
  });

  test("enforces worker and hirer authorization rules", async () => {
    const { store, taskDeps, hirer, worker, weaker, skill } = fixture();
    expect(() => registerSkill(store, { wallet: "wallet_intruder" }, worker.id, {
      name: "unauthorized_skill",
      description: "Should not register",
      base_price_lamports: "1",
      estimated_latency_ms: 1,
      required_permissions: [],
    })).toThrow("publisher wallet authorization required");
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
    expect(() => submitResult(taskDeps, { agentId: worker.id }, task.id, { result_payload: {}, artifacts: [] })).toThrow(
      "result can only be submitted for in_progress tasks",
    );
    await expect(acceptTask(taskDeps, { agentId: weaker.id }, task.id)).rejects.toThrow("worker authorization required");
    await acceptTask(taskDeps, { agentId: worker.id }, task.id);
    submitResult(taskDeps, { agentId: worker.id }, task.id, { result_payload: {}, artifacts: [] });
    await expect(resolveTask(taskDeps, { agentId: weaker.id }, task.id, { resolution: "completed" })).rejects.toThrow(
      "hirer, evaluator, or admin authorization required",
    );
  });

  test("builds a coordination graph from parent_task_id", async () => {
    const { store, taskDeps, hirer, worker, weaker, skill, weakerSkill } = fixture();
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
    const graph = getTaskGraph(store, child.id);
    expect(graph.rootTaskId).toBe(parent.id);
    expect(graph.nodes.map((node) => node.taskId)).toEqual(expect.arrayContaining([parent.id, child.id]));
    expect(graph.edges).toContainEqual({ from: parent.id, to: child.id });
  });

  test("exposes the core Hono API routes", async () => {
    const { app } = createApp();
    const hirer = await post(app, "/agents", { publisher_wallet: "wallet_api_hirer", name: "API Hirer", description: "Creates work" }, {
      "x-wallet": "wallet_api_hirer",
    });
    const worker = await post(app, "/agents", { publisher_wallet: "wallet_api_worker", name: "API Worker", description: "Does work" }, {
      "x-wallet": "wallet_api_worker",
    });
    const skill = await post(app, `/agents/${worker.id}/skills`, {
      name: "report_generation",
      description: "Writes short reports",
      base_price_lamports: "10000000",
      estimated_latency_ms: 1000,
      required_permissions: [],
    }, { "x-wallet": "wallet_api_worker" });

    const discovery = await get(app, "/agents/discover?capability=report_generation&status=active");
    expect(discovery.results).toHaveLength(1);

    const task = await post(app, "/tasks", {
      hirer_agent_id: hirer.id,
      worker_agent_id: worker.id,
      skill_id: skill.id,
      task_payload: { topic: "OmniClaw" },
      payment_lamports: "10000000",
      deadline: future(),
    }, { "x-agent-id": hirer.id });
    expect(task.status).toBe("escrow_locked");

    const accepted = await post(app, `/tasks/${task.id}/accept`, {}, { "x-agent-id": worker.id });
    expect(accepted.status).toBe("in_progress");
    const result = await post(app, `/tasks/${task.id}/result`, { result_payload: { ok: true }, artifacts: [] }, { "x-agent-id": worker.id });
    expect(result.taskId).toBe(task.id);
    const resolved = await post(app, `/tasks/${task.id}/resolve`, { resolution: "completed", quality_score: 90, review_score: 5 }, {
      "x-agent-id": hirer.id,
    });
    expect(resolved.status).toBe("completed");
    const graph = await get(app, `/tasks/${task.id}/graph`);
    expect(graph.rootTaskId).toBe(task.id);
  });
});

const future = (minutes = 60) => new Date(Date.now() + minutes * 60_000).toISOString();

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
