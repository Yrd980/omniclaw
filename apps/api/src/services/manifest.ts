import { invariant } from "../errors";
import type { DataStore } from "../store";
import type { Actor, DeliveryManifest, ManifestInput, Task, TaskResult } from "../types";

export type SubmitManifestInput = {
  manifest_payload: Record<string, unknown>;
  public_safe?: boolean;
  inputs?: ManifestInput[];
  outputs?: ManifestInput[];
  verifier?: {
    kind: "script" | "none" | "manual";
    entrypoint?: string;
    smoke_command?: string;
    expected_output?: string;
    timeout_ms?: number;
  };
  verification_timeout_ms?: number;
};

export const submitManifest = async (
  store: DataStore,
  actor: Actor,
  taskId: string,
  input: SubmitManifestInput,
): Promise<DeliveryManifest> => {
  const task = await store.getTask(taskId);
  invariant(task, 404, "NOT_FOUND", "task not found");
  invariant(actor.agentId === task.workerAgentId || actor.role === "admin", 403, "FORBIDDEN", "worker authorization required");
  invariant(task.status === "submitted" || task.status === "in_progress", 409, "CONFLICT", "task must be submitted or in_progress to attach manifest");

  const result = await store.getTaskResultForTask(taskId);
  invariant(result, 404, "NOT_FOUND", "task result not found; submit result before manifest");

  const existingManifest = await store.getDeliveryManifestByTaskResultId(result.id);
  if (existingManifest) {
    throw new Error("manifest already exists for this task result");
  }

  const manifestHash = computeManifestHash(input.manifest_payload);
  const verifierCommand = input.verifier?.smoke_command ?? input.verifier?.entrypoint ?? null;

  const now = store.now();
  const manifest: DeliveryManifest = {
    id: store.nextId("manifest"),
    taskResultId: result.id,
    taskId,
    manifestVersion: "omniclaw.delivery.v1",
    publicSafe: input.public_safe ?? false,
    manifestPayload: input.manifest_payload,
    manifestHash,
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
    verifierStatus: "pending",
    verifierCommand,
    verifierExpectedOutput: input.verifier?.expected_output ?? null,
    verifierExitCode: null,
    verifierStdout: null,
    verifierStdoutHash: null,
    verifierRanAt: null,
    verificationTimeoutMs: input.verification_timeout_ms ?? 30000,
    createdAt: now,
  };

  await store.saveDeliveryManifest(manifest);

  for (const output of manifest.outputs) {
    if (output.uri) {
      const check = {
        id: store.nextId("acheck"),
        taskResultId: result.id,
        taskId,
        artifactUri: output.uri,
        artifactHash: output.hash ?? null,
        safetyStatus: output.safety_label === "validated" ? "validated" : "unvalidated",
        secretScanStatus: "pending" as const,
        secretScanFindings: [],
        displayable: manifest.publicSafe,
        scannedAt: null,
        createdAt: now,
      };
      await store.saveArtifactCheck(check);
    }
  }

  return manifest;
};

export const getManifest = async (store: DataStore, taskId: string): Promise<DeliveryManifest | null> => {
  const manifest = await store.getDeliveryManifestByTaskId(taskId);
  return manifest ?? null;
};

export const updateManifestVerifierStatus = async (
  store: DataStore,
  manifest: DeliveryManifest,
  status: DeliveryManifest["verifierStatus"],
  exitCode: number | null,
  stdout: string | null,
): Promise<DeliveryManifest> => {
  const updated: DeliveryManifest = {
    ...manifest,
    verifierStatus: status,
    verifierExitCode: exitCode,
    verifierStdout: stdout,
    verifierStdoutHash: stdout ? computeHash(stdout) : null,
    verifierRanAt: store.now(),
  };
  await store.updateDeliveryManifest(updated);
  return updated;
};

const computeManifestHash = (payload: Record<string, unknown>): string => {
  const str = JSON.stringify(payload, Object.keys(payload).sort());
  return `sha256:${computeHash(str)}`;
};

const computeHash = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};
