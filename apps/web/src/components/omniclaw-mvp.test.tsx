import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createOmniClawClient, OmniClawApiError } from "@omniclaw/sdk";
import { createApp } from "../../../../apps/api/src/app";
import { OmniClawMvp } from "./omniclaw-mvp";

type TestWindow = Window & typeof globalThis & {
  ResizeObserver: typeof ResizeObserver;
};

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  globalThis.window = dom.window as unknown as TestWindow;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.SVGElement = dom.window.SVGElement;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
  (globalThis.window as TestWindow).ResizeObserver = globalThis.ResizeObserver;
});

afterEach(() => {
  cleanup();
});

describe("OmniClaw web MVP", () => {
  test("visualizes discovery, task lifecycle, detail, events, and graph through the SDK", async () => {
    const { client, hirer, worker, skill } = await fixture("ui_flow");
    const createdTask = await client.createTask({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "OmniClaw marketplace discovery" },
      payment_lamports: skill.base_price_lamports,
      deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
    }, { agentId: hirer.agent_id });
    expect(createdTask.status).toBe("escrow_locked");
    await client.acceptTask(createdTask.task_id, { agentId: worker.agent_id });
    await client.submitResult(createdTask.task_id, { result_payload: { summary: "Submitted through SDK smoke coverage" }, artifacts: [] }, { agentId: worker.agent_id });
    await client.resolveTask(createdTask.task_id, { resolution: "completed", quality_score: 92, review_score: 5 }, { agentId: hirer.agent_id });
    const detail = await client.getTaskDetail(createdTask.task_id);
    const graph = await client.getTaskGraph(createdTask.task_id);
    const ui = render(<OmniClawMvp client={client} />);

    expect((await ui.findAllByText(worker.name, {}, { timeout: 10_000 })).length).toBeGreaterThan(0);
    expect(await ui.findByText("Autonomous agent hiring graph")).toBeTruthy();
    expect(await ui.findByText("Protocol event stream")).toBeTruthy();
    expect((await ui.findAllByText(createdTask.task_id, {}, { timeout: 10_000 })).length).toBeGreaterThan(0);
    expect(detail.task.status).toBe("completed");
    expect(detail.result?.result_payload).toEqual({ summary: "Submitted through SDK smoke coverage" });
    expect(detail.settlement_events.some((event) => event.event_type === "worker_paid")).toBe(true);
    expect(detail.reputation_events.length).toBe(1);
    expect(graph.nodes[0]?.taskId).toBe(createdTask.task_id);
    expect((await ui.findAllByText("worker_paid")).length).toBeGreaterThan(0);
  });

  test("renders typed API error envelopes with code, message, path, and details", async () => {
    const failingClient = {
      discoverAgents: async () => {
        throw new OmniClawApiError(400, "INVALID_QUERY", "status is not supported", { status: "offline" }, "/agents/discover");
      },
      listTasks: async () => ({ tasks: [] }),
      getTaskDetail: async () => {
        throw new OmniClawApiError(404, "NOT_FOUND", "task missing", null, "/tasks/task_missing");
      },
      getTaskGraph: async () => ({ rootTaskId: "task_missing", nodes: [], edges: [] }),
    } as unknown as ReturnType<typeof createOmniClawClient>;
    const ui = render(<OmniClawMvp client={failingClient} />);

    const alert = await ui.findByRole("alert");
    expect(within(alert).getByText(/API error envelope/)).toBeTruthy();
    expect(within(alert).getByText(/code: INVALID_QUERY/)).toBeTruthy();
    expect(within(alert).getByText(/path: \/agents\/discover/)).toBeTruthy();
    expect(within(alert).getByText(/details:/)).toBeTruthy();
  });

  test("runs a visual delegation demo from the web UI through real SDK/API calls", async () => {
    const ctx = createApp();
    const client = createOmniClawClient({ baseUrl: "http://omniclaw.test", fetch: honoFetch(ctx.app) });
    const ui = render(<OmniClawMvp client={client} />);

    fireEvent.click(await ui.findByRole("button", { name: /Trading Network/ }));

    expect(await ui.findByText(/Trading Network hired 3 specialist agents through live SDK\/API calls/)).toBeTruthy();
    await waitFor(async () => {
      const tasks = await client.listTasks();
      expect(tasks.tasks).toHaveLength(4);
      expect(tasks.tasks.filter((task) => task.parent_task_id)).toHaveLength(3);
      expect(tasks.tasks.every((task) => task.status === "completed")).toBe(true);
      const parent = tasks.tasks.find((task) => task.parent_task_id === null);
      expect(parent).toBeTruthy();
      const graph = await client.getTaskGraph(parent!.task_id);
      expect(graph.nodes).toHaveLength(4);
      expect(graph.edges).toHaveLength(3);
    });
  });
});

const fixture = async (suffix: string) => {
  const ctx = createApp();
  const client = createOmniClawClient({ baseUrl: "http://omniclaw.test", fetch: honoFetch(ctx.app) });
  const hirer = await client.registerAgent({
    publisher_wallet: `wallet_${suffix}_hirer`,
    name: `${suffix} Hirer`,
    description: "Creates marketplace tasks",
  }, { wallet: `wallet_${suffix}_hirer` });
  const worker = await client.registerAgent({
    publisher_wallet: `wallet_${suffix}_worker`,
    name: `${suffix} Worker`,
    description: "Accepts marketplace tasks",
    reputation_score: 91,
    success_rate: 0.97,
    avg_latency_ms: 2400,
    quality_score: 93,
    delegation_success_rate: 0.9,
    historical_earnings_lamports: "100000000",
    stake_amount: "50000000",
  }, { wallet: `wallet_${suffix}_worker` });
  const skill = await client.registerSkill(worker.agent_id, {
    name: "market_research",
    description: "Produces a structured market summary",
    input_schema: { type: "object", required: ["topic"], properties: { topic: { type: "string" } } },
    output_schema: { type: "object", required: ["summary"], properties: { summary: { type: "string" } } },
    base_price_lamports: "50000000",
    estimated_latency_ms: 2400,
    required_permissions: ["web_access"],
  }, { wallet: worker.publisher_wallet });
  return { ...ctx, client, hirer, worker, skill };
};

const honoFetch = (app: ReturnType<typeof createApp>["app"]): typeof fetch =>
  ((input, init) => {
    const url = new URL(input.toString());
    return app.request(`${url.pathname}${url.search}`, init);
  }) as typeof fetch;
