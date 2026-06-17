import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { MockRuntimeAdapter } from "./adapters/runtime";
import { MockSettlementAdapter } from "./adapters/settlement";
import { createMemoryStore } from "./store";

const HASH_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const INPUT_HASH = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

describe("delivery manifest submission", () => {
  test("stores a valid omniclaw.delivery.v1 manifest and exposes proof state", async () => {
    const fixture = await createFixture();
    const response = await fixture.request(`/tasks/${fixture.taskId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-id": fixture.workerId },
      body: JSON.stringify({
        result_payload: { ok: true },
        artifacts: [artifact(HASH_A)],
        delivery_manifest: manifest(fixture.taskId, fixture.workerId, HASH_A),
      }),
    });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.delivery_manifest_id).toStartWith("manifest_");
    expect(result.delivery_manifest.manifest_version).toBe("omniclaw.delivery.v1");
    expect(result.delivery_manifest.public_safety_status).toBe("public_safe");
    expect(result.delivery_manifest.verifier_status).toBe("pending");

    const detailResponse = await fixture.request(`/tasks/${fixture.taskId}`);
    const detail = await detailResponse.json();
    expect(detail.proof.delivery_manifest.present).toBe(true);
    expect(detail.proof.delivery_manifest.public_safety_status).toBe("public_safe");
    expect(detail.proof.verifier.status).toBe("pending");
    expect(detail.proof.artifacts.validated_count).toBe(1);
  });

  test("rejects public-safe manifests when artifact hashes are missing", async () => {
    const fixture = await createFixture();
    const response = await fixture.request(`/tasks/${fixture.taskId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-id": fixture.workerId },
      body: JSON.stringify({
        result_payload: { ok: true },
        artifacts: [{ kind: "markdown", uri: "artifact://report.md", safety_label: "validated" }],
        delivery_manifest: manifest(fixture.taskId, fixture.workerId, HASH_A),
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("hash");
  });

  test("rejects manifests whose output hash does not match submitted artifact", async () => {
    const fixture = await createFixture();
    const response = await fixture.request(`/tasks/${fixture.taskId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-id": fixture.workerId },
      body: JSON.stringify({
        result_payload: { ok: true },
        artifacts: [artifact(HASH_B)],
        delivery_manifest: manifest(fixture.taskId, fixture.workerId, HASH_A),
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("hash must match artifact hash");
  });
});

const createFixture = async () => {
  const store = createMemoryStore();
  const runtime = new MockRuntimeAdapter();
  const settlement = new MockSettlementAdapter(undefined, store.now);
  const { app } = createApp({
    store,
    taskDeps: { store, runtime, settlement },
    runtimeConfig: {
      environment: "local",
      storeMode: "memory",
      runtimeAdapterMode: "mock",
      settlementAdapterMode: "mock",
      authMode: "headers",
      productionReady: false,
      warnings: [],
    },
  });
  const request = (path: string, init?: RequestInit) => app.request(path, init);

  const hirer = await json(await request("/agents", {
    method: "POST",
    headers: { "content-type": "application/json", "x-wallet": "wallet_hirer" },
    body: JSON.stringify({ publisher_wallet: "wallet_hirer", name: "Hirer", description: "Creates tasks" }),
  }));
  const worker = await json(await request("/agents", {
    method: "POST",
    headers: { "content-type": "application/json", "x-wallet": "wallet_worker" },
    body: JSON.stringify({ publisher_wallet: "wallet_worker", name: "Worker", description: "Does work" }),
  }));
  const skill = await json(await request(`/agents/${worker.agent_id}/skills`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-wallet": "wallet_worker" },
    body: JSON.stringify({
      name: "report_generation",
      description: "Writes reports",
      input_schema: { type: "object", required: ["topic"], properties: { topic: { type: "string" } } },
      output_schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
      base_price_lamports: "10000000",
      estimated_latency_ms: 1000,
      required_permissions: [],
    }),
  }));
  const task = await json(await request("/tasks", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-id": hirer.agent_id },
    body: JSON.stringify({
      hirer_agent_id: hirer.agent_id,
      worker_agent_id: worker.agent_id,
      skill_id: skill.skill_id,
      task_payload: { topic: "OmniClaw", runtime_submit_result: false },
      payment_lamports: "10000000",
      deadline: new Date(Date.now() + 60_000).toISOString(),
    }),
  }));
  await request(`/tasks/${task.task_id}/accept`, {
    method: "POST",
    headers: { "x-agent-id": worker.agent_id },
  });

  return { request, taskId: task.task_id as string, workerId: worker.agent_id as string };
};

const artifact = (hash: string) => ({
  kind: "markdown",
  uri: "artifact://report.md",
  hash,
  safety_label: "validated",
});

const manifest = (taskId: string, workerId: string, outputHash: string) => ({
  manifest_version: "omniclaw.delivery.v1",
  task_id: taskId,
  source_agent_id: workerId,
  task_pack: "market_intelligence",
  public_safe: true,
  inputs: [{ name: "brief", kind: "task_payload", hash: INPUT_HASH }],
  outputs: [{ name: "report", kind: "markdown", uri: "artifact://report.md", hash: outputHash, safety_label: "validated" }],
  verifier: {
    kind: "script",
    entrypoint: "omniclaw_l1_delivery/verifier.py",
    smoke_command: "uv run python omniclaw_l1_delivery/verifier.py",
    expected_output: "PASS",
  },
  acceptance: {
    criteria: ["answers every research question", "contains no secrets"],
    review_window_hours: 24,
  },
});

const json = async (response: Response) => {
  expect(response.status).toBeLessThan(400);
  return await response.json();
};
