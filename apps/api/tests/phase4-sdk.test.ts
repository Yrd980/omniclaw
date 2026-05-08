import { describe, expect, test } from "bun:test";
import { createOmniClawClient, OmniClawApiError, type AgentDto, type SkillDto } from "@omniclaw/sdk";
import { MockSettlementAdapter } from "../src/adapters/settlement";
import type { RuntimeAcceptedTaskPayload } from "../src/adapters/runtime";
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
});

const future = (minutes = 60) => new Date(Date.now() + minutes * 60_000).toISOString();

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
