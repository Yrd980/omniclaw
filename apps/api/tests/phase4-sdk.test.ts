import { describe, expect, test } from "bun:test";
import { createOmniClawClient, OmniClawApiError, type AgentDto, type SkillDto } from "@omniclaw/sdk";
import { MockSettlementAdapter } from "../src/adapters/settlement";
import { GrpcRuntimeAdapter, type RuntimeAcceptedTaskPayload } from "../src/adapters/runtime";
import { createApp } from "../src/app";
import type { Task } from "../src/types";

const sdkFixture = async (suffix: string, setup?: (ctx: ReturnType<typeof createApp>) => void | Promise<void>) => {
  const ctx = createApp();
  await setup?.(ctx);
  const client = createOmniClawClient({ baseUrl: "http://omniclaw.test", fetch: honoFetch(ctx.app) });
  const hirer = await client.registerAgent({
    publisher_wallet: `wallet_${suffix}_hirer`,
    name: `${suffix} Hirer`,
    description: "Creates SDK tasks",
  }, { wallet: `wallet_${suffix}_hirer` });
  const worker = await client.registerAgent({
    publisher_wallet: `wallet_${suffix}_worker`,
    name: `${suffix} Worker`,
    description: "Accepts SDK tasks",
  }, { wallet: `wallet_${suffix}_worker` });
  const skill = await client.registerSkill(worker.agent_id, {
    name: `${suffix}_report`,
    description: "Produces a report",
    input_schema: { type: "object", required: ["topic"], properties: { topic: { type: "string" } } },
    output_schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
    base_price_lamports: "10000000",
    estimated_latency_ms: 1000,
    required_permissions: [],
  }, { wallet: `wallet_${suffix}_worker` });
  return { ...ctx, client, hirer, worker, skill };
};

describe("Phase 4 SDK client and runtime callback contract", () => {
  test("runs the full task flow through the SDK and exposes detail/timeline/reputation queries", async () => {
    const { client, hirer, worker, skill } = await sdkFixture("flow");
    expect((await client.getAgent(worker.agent_id)).publisher_wallet).toBe(worker.publisher_wallet);
    expect((await client.listAgentSkills(worker.agent_id)).skills.map((listed) => listed.skill_id)).toContain(skill.skill_id);
    expect((await client.discoverAgents({ capability: skill.name, status: "active" })).results[0].agent.agent_id).toBe(worker.agent_id);

    const task = await client.createTask({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "OmniClaw" },
      payment_lamports: "10000000",
      deadline: future(),
    }, { agentId: hirer.agent_id });
    expect(task.status).toBe("escrow_locked");

    const listed = await client.listTasks({ worker_agent_id: worker.agent_id, status: "escrow_locked", deadline_from: future(-1) });
    expect(listed.tasks.map((item) => item.task_id)).toContain(task.task_id);

    await client.acceptTask(task.task_id, { agentId: worker.agent_id });
    await client.submitResult(task.task_id, { result_payload: { ok: true }, artifacts: [] }, { agentId: worker.agent_id });
    await client.resolveTask(task.task_id, { resolution: "completed", quality_score: 90, review_score: 5 }, { agentId: hirer.agent_id });

    const detail = await client.getTaskDetail(task.task_id);
    expect(detail.task.status).toBe("completed");
    expect(detail.result?.result_payload).toEqual({ ok: true });
    expect(detail.settlement_events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["escrow_locked", "worker_paid", "platform_fee_paid", "runtime_fee_paid"]),
    );
    expect(detail.reputation_events).toHaveLength(1);
    expect((await client.listSettlementEvents({ task_id: task.task_id })).settlement_events[0].task_id).toBe(task.task_id);
    expect((await client.listReputationEvents({ agent_id: worker.agent_id })).reputation_events[0].agent_id).toBe(worker.agent_id);
    expect((await client.getTaskGraph(task.task_id)).rootTaskId).toBe(task.task_id);
  });

  test("maps API error envelopes to typed SDK errors for schema, header, body, query, and runtime failures", async () => {
    const { client, hirer, worker, skill } = await sdkFixture("errors", ({ taskDeps }) => {
      taskDeps.runtime = {
        async dispatch() {
          throw new Error("runtime down");
        },
      };
    });

    await expectApiError(
      client.createTask({
        hirer_agent_id: hirer.agent_id,
        worker_agent_id: worker.agent_id,
        skill_id: skill.skill_id,
        task_payload: { topic: 42 },
        payment_lamports: "10000000",
        deadline: future(),
      }, { agentId: hirer.agent_id }),
      { status: 400, code: "SCHEMA_VALIDATION_FAILED", path: "/tasks" },
    );
    await expectApiError(
      client.registerAgent({ publisher_wallet: "wallet_bad", name: "Bad", description: "Bad role" }, { role: "root" as never }),
      { status: 400, code: "INVALID_HEADER", path: "/agents" },
    );
    await expectApiError(
      client.registerSkill(worker.agent_id, {
        name: "bad_body",
        description: "Missing latency",
        base_price_lamports: "10000000",
        estimated_latency_ms: undefined as never,
      }, { wallet: worker.publisher_wallet }),
      { status: 400, code: "INVALID_BODY", path: `/agents/${worker.agent_id}/skills` },
    );
    await expectApiError(
      client.listTasks({ deadline_from: "not-a-date" }),
      { status: 400, code: "INVALID_QUERY", path: "/tasks" },
    );

    const task = await client.createTask({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "runtime" },
      payment_lamports: "10000000",
      deadline: future(),
    }, { agentId: hirer.agent_id });
    await expectApiError(client.acceptTask(task.task_id, { agentId: worker.agent_id }), {
      status: 500,
      code: "INTERNAL_ERROR",
      path: `/tasks/${task.task_id}/accept`,
    });
    expect((await client.getTaskDetail(task.task_id)).task.status).toBe("failed");
  });

  test("exposes settlement failure audit through SDK detail and timelines", async () => {
    const { client, store, hirer, worker, skill } = await sdkFixture("settle", ({ taskDeps, store }) => {
      taskDeps.settlement = new ThrowingPayoutSettlementAdapter(undefined, store.now);
    });
    const task = await client.createTask({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "settlement" },
      payment_lamports: "10000000",
      deadline: future(),
    }, { agentId: hirer.agent_id });
    await client.acceptTask(task.task_id, { agentId: worker.agent_id });
    await client.submitResult(task.task_id, { result_payload: { ok: true }, artifacts: [] }, { agentId: worker.agent_id });
    await expectApiError(client.resolveTask(task.task_id, { resolution: "completed" }, { agentId: hirer.agent_id }), {
      status: 500,
      code: "INTERNAL_ERROR",
      path: `/tasks/${task.task_id}/resolve`,
    });
    const timeline = await client.listSettlementEvents({ task_id: task.task_id });
    expect(timeline.settlement_events).toContainEqual(expect.objectContaining({
      event_type: "settlement_failed",
      failure_reason: "release payout failed: chain down",
    }));
    expect((await store.getTask(task.task_id))?.status).toBe("submitted");
  });

  test("dispatches accepted tasks using the runtime callback contract payload", async () => {
    let dispatched: RuntimeAcceptedTaskPayload | undefined;
    const { client, hirer, worker, skill } = await sdkFixture("runtime_contract", ({ taskDeps }) => {
      taskDeps.runtime = {
        async dispatch(payload) {
          dispatched = payload;
          return { accepted: true };
        },
      };
    });
    const task = await client.createTask({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "contract" },
      payment_lamports: "10000000",
      deadline: future(),
    }, { agentId: hirer.agent_id });
    await client.acceptTask(task.task_id, { agentId: worker.agent_id });
    expect(dispatched).toEqual({
      task_id: task.task_id,
      parent_task_id: null,
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "contract" },
      payment_lamports: "10000000",
      worker_payout_lamports: "9700000",
      deadline: task.deadline,
      accepted_at: expect.any(String),
      callback: {
        method: "POST",
        path: `/tasks/${task.task_id}/result`,
        actor_headers: {
          "x-agent-id": worker.agent_id,
        },
      },
    });
  });

  test("submits runtime results returned through the dispatch contract", async () => {
    const { client, hirer, worker, skill } = await sdkFixture("runtime_result", ({ taskDeps }) => {
      taskDeps.runtime = {
        async dispatch() {
          return {
            accepted: true,
            submitResult: true,
            resultPayload: { ok: true },
            artifacts: [{ kind: "text", value: "runtime" }],
          };
        },
      };
    });
    const task = await client.createTask({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "contract" },
      payment_lamports: "10000000",
      deadline: future(),
    }, { agentId: hirer.agent_id });

    const accepted = await client.acceptTask(task.task_id, { agentId: worker.agent_id });
    const detail = await client.getTaskDetail(task.task_id);

    expect(accepted.status).toBe("submitted");
    expect(detail.result?.result_payload).toEqual({ ok: true });
    expect(detail.result?.artifacts).toEqual([{ kind: "text", value: "runtime" }]);
  });

  test("allows coordinator tasks to defer runtime result submission", async () => {
    const { client, hirer, worker, skill } = await sdkFixture("runtime_defer", ({ taskDeps }) => {
      taskDeps.runtime = {
        async dispatch() {
          return {
            accepted: true,
            submitResult: true,
            resultPayload: { ok: true },
          };
        },
      };
    });
    const task = await client.createTask({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "coordination", runtime_submit_result: false },
      payment_lamports: "10000000",
      deadline: future(),
    }, { agentId: hirer.agent_id });

    const accepted = await client.acceptTask(task.task_id, { agentId: worker.agent_id });
    const detail = await client.getTaskDetail(task.task_id);

    expect(accepted.status).toBe("in_progress");
    expect(detail.result).toBeNull();
  });

  test("proves AI agents can autonomously hire specialist agents across current coordination scenarios", async () => {
    const scenarios: DelegationScenario[] = [
      {
        slug: "trading",
        coordinatorName: "Trading Agent",
        mission: "Produce an execution-ready BTC trade plan",
        specialists: [
          { name: "Twitter Scraper Agent", capability: "twitter_scraping", brief: "Collect social posts and sentiment signals" },
          { name: "Onchain Analysis Agent", capability: "onchain_analysis", brief: "Analyze wallet flows and exchange movement" },
          { name: "Risk Management Agent", capability: "risk_management", brief: "Size exposure and define invalidation levels" },
        ],
      },
      {
        slug: "marketing",
        coordinatorName: "Marketing Agent",
        mission: "Launch a multilingual product campaign",
        specialists: [
          { name: "SEO Agent", capability: "seo_strategy", brief: "Build keyword clusters and ranking plan" },
          { name: "Copywriting Agent", capability: "copywriting", brief: "Write campaign landing and ad copy" },
          { name: "Video Editing Agent", capability: "video_editing", brief: "Create short-form video production notes" },
          { name: "Translation Agent", capability: "translation", brief: "Localize campaign copy" },
        ],
      },
      {
        slug: "founder",
        coordinatorName: "Founder Agent",
        mission: "Ship a crypto startup MVP and growth loop",
        specialists: [
          { name: "UI Agent", capability: "ui_design", brief: "Design investor-ready product UX" },
          { name: "Solidity Agent", capability: "solidity_development", brief: "Implement smart-contract primitives" },
          { name: "Growth Agent", capability: "growth_strategy", brief: "Design activation and distribution experiments" },
        ],
      },
    ];
    const { client } = await sdkFixture("delegation_networks", ({ taskDeps }) => {
      taskDeps.runtime = {
        async dispatch(payload) {
          return {
            accepted: true,
            submitResult: true,
            resultPayload: {
              ok: true,
              worker_agent_id: payload.worker_agent_id,
              delivered_for: payload.task_payload.capability ?? payload.task_payload.mission,
            },
            artifacts: [{ kind: "runtime", task_id: payload.task_id }],
          };
        },
      };
    });
    const human = await client.registerAgent({
      publisher_wallet: "wallet_delegation_human",
      name: "Human Sponsor",
      description: "Funds coordinator agents",
      reputation_score: 91,
      success_rate: 96,
      quality_score: 93,
    }, { wallet: "wallet_delegation_human" });

    for (const scenario of scenarios) {
      const network = await registerDelegationScenario(client, scenario);
      const parent = await client.createTask({
        hirer_agent_id: human.agent_id,
        worker_agent_id: network.coordinator.agent_id,
        skill_id: network.coordinatorSkill.skill_id,
        task_payload: {
          mission: scenario.mission,
          runtime_submit_result: false,
        },
        payment_lamports: "90000000",
        deadline: future(90),
      }, { agentId: human.agent_id });
      expect((await client.acceptTask(parent.task_id, { agentId: network.coordinator.agent_id })).status).toBe("in_progress");

      const childTasks = [];
      for (const specialist of scenario.specialists) {
        const discovered = await client.discoverAgents({
          capability: specialist.capability,
          reputation_gt: 70,
          status: "active",
        });
        expect(discovered.results[0].agent.agent_id).toBe(network.specialists[specialist.capability].agent.agent_id);

        const child = await client.createTask({
          parent_task_id: parent.task_id,
          hirer_agent_id: network.coordinator.agent_id,
          worker_agent_id: discovered.results[0].agent.agent_id,
          skill_id: discovered.results[0].skill.skill_id,
          task_payload: {
            capability: specialist.capability,
            brief: specialist.brief,
            parent_mission: scenario.mission,
          },
          payment_lamports: discovered.results[0].skill.base_price_lamports,
          deadline: parent.deadline,
        }, { agentId: network.coordinator.agent_id });
        await client.acceptTask(child.task_id, { agentId: discovered.results[0].agent.agent_id });
        await client.resolveTask(child.task_id, { resolution: "completed", quality_score: 92, review_score: 5 }, { agentId: network.coordinator.agent_id });
        childTasks.push(child);
      }

      await client.submitResult(parent.task_id, {
        result_payload: {
          ok: true,
          scenario: scenario.slug,
          hired_capabilities: scenario.specialists.map((specialist) => specialist.capability),
          child_task_ids: childTasks.map((task) => task.task_id),
        },
        artifacts: childTasks.map((task) => ({ kind: "child_task", task_id: task.task_id })),
      }, { agentId: network.coordinator.agent_id });
      await client.resolveTask(parent.task_id, { resolution: "completed", quality_score: 95, review_score: 5 }, { agentId: human.agent_id });

      const graph = await client.getTaskGraph(parent.task_id);
      expect(graph.rootTaskId).toBe(parent.task_id);
      expect(graph.nodes).toHaveLength(scenario.specialists.length + 1);
      expect(graph.edges).toEqual(expect.arrayContaining(
        childTasks.map((task) => ({ from: parent.task_id, to: task.task_id })),
      ));
      expect((await client.listTasks({ parent_task_id: parent.task_id })).tasks.map((task) => task.task_id).sort()).toEqual(
        childTasks.map((task) => task.task_id).sort(),
      );
      expect((await client.getTaskDetail(parent.task_id)).reputation_events[0]).toEqual(expect.objectContaining({
        agent_id: network.coordinator.agent_id,
        delegation_success: true,
      }));
    }
  });

  test("maps runtime callback contract payloads through the gRPC adapter", async () => {
    const adapter = new TestGrpcRuntimeAdapter("localhost:50051");
    const result = await adapter.dispatch({
      task_id: "task-1",
      parent_task_id: null,
      hirer_agent_id: "hirer-1",
      worker_agent_id: "worker-1",
      skill_id: "skill-1",
      task_payload: { topic: "contract" },
      payment_lamports: "1000",
      worker_payout_lamports: "900",
      deadline: future(),
      accepted_at: null,
      callback: {
        method: "POST",
        path: "/tasks/task-1/result",
        actor_headers: { "x-agent-id": "worker-1" },
      },
    });

    expect(adapter.request).toEqual({
      taskId: "task-1",
      hirerAgentId: "hirer-1",
      workerAgentId: "worker-1",
      skillId: "skill-1",
      taskPayload: { json: JSON.stringify({ topic: "contract" }) },
      paymentLamports: "1000",
      workerPayoutLamports: "900",
      deadline: expect.any(String),
      callback: {
        method: "POST",
        path: "/tasks/task-1/result",
        actorHeaders: { "x-agent-id": "worker-1" },
      },
    });
    expect(result).toEqual({
      accepted: true,
      submitResult: true,
      resultPayload: { ok: true },
      artifacts: [{ kind: "text", value: "done" }],
    });
  });
});

const future = (minutes = 60) => new Date(Date.now() + minutes * 60_000).toISOString();

type DelegationScenario = {
  slug: string;
  coordinatorName: string;
  mission: string;
  specialists: Array<{
    name: string;
    capability: string;
    brief: string;
  }>;
};

const registerDelegationScenario = async (
  client: ReturnType<typeof createOmniClawClient>,
  scenario: DelegationScenario,
) => {
  const coordinatorWallet = `wallet_${scenario.slug}_coordinator`;
  const coordinator = await client.registerAgent({
    publisher_wallet: coordinatorWallet,
    name: scenario.coordinatorName,
    description: `Coordinates specialist hiring for ${scenario.slug} missions`,
    reputation_score: 88,
    success_rate: 94,
    quality_score: 91,
    delegation_success_rate: 90,
    stake_amount: "50000000",
  }, { wallet: coordinatorWallet });
  const coordinatorSkill = await client.registerSkill(coordinator.agent_id, {
    name: `${scenario.slug}_coordination`,
    description: `Plans, hires, and aggregates ${scenario.slug} specialist work`,
    input_schema: {
      type: "object",
      required: ["mission"],
      properties: {
        mission: { type: "string" },
        runtime_submit_result: { type: "boolean" },
      },
    },
    output_schema: {
      type: "object",
      required: ["ok", "scenario", "hired_capabilities", "child_task_ids"],
      properties: {
        ok: { type: "boolean" },
        scenario: { type: "string" },
        hired_capabilities: { type: "array" },
        child_task_ids: { type: "array" },
      },
    },
    base_price_lamports: "30000000",
    estimated_latency_ms: 1200,
    required_permissions: ["discover_agents", "create_child_tasks", "read_child_task_details"],
  }, { wallet: coordinatorWallet });

  const specialists: Record<string, { agent: AgentDto; skill: SkillDto }> = {};
  for (const [index, specialist] of scenario.specialists.entries()) {
    const wallet = `wallet_${scenario.slug}_${specialist.capability}`;
    const agent = await client.registerAgent({
      publisher_wallet: wallet,
      name: specialist.name,
      description: specialist.brief,
      reputation_score: 82 + index,
      success_rate: 89 + index,
      avg_latency_ms: 800 + index * 100,
      quality_score: 86 + index,
      stake_amount: `${20_000_000 + index * 1_000_000}`,
    }, { wallet });
    const skill = await client.registerSkill(agent.agent_id, {
      name: specialist.capability,
      description: specialist.brief,
      input_schema: {
        type: "object",
        required: ["capability", "brief", "parent_mission"],
        properties: {
          capability: { type: "string" },
          brief: { type: "string" },
          parent_mission: { type: "string" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "worker_agent_id", "delivered_for"],
        properties: {
          ok: { type: "boolean" },
          worker_agent_id: { type: "string" },
          delivered_for: { type: "string" },
        },
      },
      base_price_lamports: `${8_000_000 + index * 1_000_000}`,
      estimated_latency_ms: 900 + index * 100,
      required_permissions: [],
    }, { wallet });
    specialists[specialist.capability] = { agent, skill };
  }

  return { coordinator, coordinatorSkill, specialists };
};

const honoFetch = (app: ReturnType<typeof createApp>["app"]): typeof fetch =>
  ((input, init) => {
    const url = new URL(input.toString());
    return app.request(`${url.pathname}${url.search}`, init);
  }) as typeof fetch;

const expectApiError = async (
  promise: Promise<unknown>,
  expected: { status: number; code: string; path: string },
) => {
  try {
    await promise;
    throw new Error("expected SDK call to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(OmniClawApiError);
    const apiError = error as OmniClawApiError;
    expect(apiError.status).toBe(expected.status);
    expect(apiError.code).toBe(expected.code);
    expect(apiError.path).toBe(expected.path);
  }
};

class ThrowingPayoutSettlementAdapter extends MockSettlementAdapter {
  async releasePayout(_task: Task, _wallets: { hirerWallet: string; workerWallet: string }): Promise<never> {
    throw new Error("chain down");
  }
}

type _SdkContractCompileCoverage = [
  AgentDto["agent_id"],
  SkillDto["skill_id"],
  Awaited<ReturnType<ReturnType<typeof createOmniClawClient>["getTaskDetail"]>>["task"]["task_payload"],
  RuntimeAcceptedTaskPayload["callback"]["actor_headers"]["x-agent-id"],
];

class TestGrpcRuntimeAdapter extends GrpcRuntimeAdapter {
  request: unknown;

  protected override async dispatchGrpc(request: unknown): Promise<{ accepted: boolean; resultPayload?: { json: string }; artifacts?: Array<{ json: string }> }> {
    this.request = request;
    return {
      accepted: true,
      resultPayload: { json: JSON.stringify({ ok: true }) },
      artifacts: [{ json: JSON.stringify({ kind: "text", value: "done" }) }],
    };
  }
}
