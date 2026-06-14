import type { JsonObject, ReputationEvent, SettlementEvent, Task, TaskResult } from "./types";

type ArtifactValidationStatus = "validated" | "missing_hash" | "unsafe" | "private_runtime" | "unvalidated";

export type ArtifactReference = {
  kind: string;
  task_id: string | null;
  uri: string | null;
  hash: string | null;
  checksum: string | null;
  safety_label: string | null;
  validation_status: ArtifactValidationStatus;
  displayable: boolean;
};

export type TaskContractDto = {
  task_pack: string;
  project_context: JsonObject;
  research_questions: string[];
  acceptance_criteria: string[];
  permission_scope: string[];
  delegation_budget_lamports: string | null;
  privacy_level: string;
  review_window_hours: number;
  settlement_mode: string;
  settlement_rules: {
    escrow_required: true;
    worker_starts_after_escrow: true;
    approval: string;
    rejection: string;
    dispute_resolution: string;
    timeout: string;
  };
  frozen_at: string;
};

export type TaskProofDto = {
  environment: string;
  escrow: {
    locked: boolean;
    escrow_account: string | null;
    tx_signature: string | null;
    locked_at: string | null;
  };
  execution: {
    status: Task["status"];
    accepted_at: string | null;
    submitted_at: string | null;
    completed_at: string | null;
  };
  artifacts: {
    count: number;
    validated_count: number;
    unsafe_count: number;
    private_runtime_count: number;
    references: ArtifactReference[];
  };
  settlement: {
    released: boolean;
    refunded: boolean;
    disputed: boolean;
    tx_signature: string | null;
  };
  reputation: {
    events: number;
    worker_delta: number;
  };
};

export type TaskProofSummaryDto = {
  escrow_locked: boolean;
  artifact_count: number;
  validated_artifact_count: number;
  settlement_state: "locked" | "released" | "refunded" | "disputed" | "failed" | "unfunded";
};

export const taskContractDto = (task: Task): TaskContractDto => {
  const payload = task.taskPayload;
  return {
    task_pack: stringValue(payload.task_pack, "custom_research"),
    project_context: objectValue(payload.project_context),
    research_questions: stringArrayValue(payload.research_questions),
    acceptance_criteria: stringArrayValue(payload.acceptance_criteria),
    permission_scope: stringArrayValue(payload.permission_scope),
    delegation_budget_lamports: nullableStringValue(payload.delegation_budget_lamports),
    privacy_level: stringValue(payload.privacy_level, "private"),
    review_window_hours: numberValue(payload.review_window_hours, 24),
    settlement_mode: stringValue(payload.settlement_mode, "demo_mock"),
    settlement_rules: {
      escrow_required: true,
      worker_starts_after_escrow: true,
      approval: "hirer approval releases worker payout and records reputation",
      rejection: "hirer rejection or evaluator failure refunds escrow",
      dispute_resolution: "manual evaluator/admin review",
      timeout: "deadline expiry moves submitted work to dispute or refunds active work",
    },
    frozen_at: task.createdAt,
  };
};

export const taskProofDto = (
  task: Task,
  result: TaskResult | undefined,
  settlementEvents: SettlementEvent[],
  reputationEvents: ReputationEvent[],
): TaskProofDto => {
  const proofSummary = taskProofSummaryDto(task, result, settlementEvents);
  const lockedEvent = settlementEvents.find((event) => event.eventType === "escrow_locked");
  const workerDelta = reputationEvents
    .filter((event) => event.agentId === task.workerAgentId)
    .reduce((sum, event) => sum + event.reputationDelta, 0);
  return {
    environment: stringValue(task.taskPayload.settlement_mode, "demo_mock"),
    escrow: {
      locked: proofSummary.escrow_locked,
      escrow_account: task.escrowAccount,
      tx_signature: task.escrowTxSignature,
      locked_at: lockedEvent?.createdAt ?? null,
    },
    execution: {
      status: task.status,
      accepted_at: task.acceptedAt,
      submitted_at: task.submittedAt,
      completed_at: task.completedAt,
    },
    artifacts: artifactProof(result),
    settlement: {
      released: proofSummary.settlement_state === "released",
      refunded: proofSummary.settlement_state === "refunded",
      disputed: task.status === "disputed",
      tx_signature: task.settlementTxSignature,
    },
    reputation: {
      events: reputationEvents.length,
      worker_delta: workerDelta,
    },
  };
};

export const taskProofSummaryDto = (
  task: Task,
  result: TaskResult | undefined,
  settlementEvents: SettlementEvent[],
): TaskProofSummaryDto => {
  const artifacts = artifactProof(result);
  return {
    escrow_locked: Boolean(task.escrowAccount && task.escrowTxSignature) || settlementEvents.some((event) => event.eventType === "escrow_locked"),
    artifact_count: artifacts.count,
    validated_artifact_count: artifacts.validated_count,
    settlement_state: settlementState(task, settlementEvents),
  };
};

const settlementState = (task: Task, settlementEvents: SettlementEvent[]): TaskProofSummaryDto["settlement_state"] => {
  if (settlementEvents.some((event) => event.eventType === "settlement_failed")) {
    return "failed";
  }
  if (settlementEvents.some((event) => event.eventType === "worker_paid")) {
    return "released";
  }
  if (settlementEvents.some((event) => event.eventType === "hirer_refunded")) {
    return "refunded";
  }
  if (task.status === "disputed") {
    return "disputed";
  }
  return task.escrowAccount ? "locked" : "unfunded";
};

const artifactProof = (result: TaskResult | undefined): TaskProofDto["artifacts"] => {
  const references = normalizeArtifactReferences(result?.artifacts);
  return {
    count: references.length,
    validated_count: references.filter((artifact) => artifact.validation_status === "validated").length,
    unsafe_count: references.filter((artifact) => artifact.validation_status === "unsafe").length,
    private_runtime_count: references.filter((artifact) => artifact.validation_status === "private_runtime").length,
    references,
  };
};

export const normalizeArtifactReferences = (artifacts: unknown[] | undefined): ArtifactReference[] =>
  (artifacts ?? []).map((artifact) => {
    const item = typeof artifact === "object" && artifact !== null && !Array.isArray(artifact)
      ? artifact as Record<string, unknown>
      : {};
    const hash = nullableStringValue(item.hash);
    const safetyLabel = nullableStringValue(item.safety_label);
    const privateRuntime = Boolean(item.private_runtime) || stringArrayValue(item.tags).includes("private_runtime");
    const unsafe = safetyLabel === "unsafe";
    const validationStatus: ArtifactValidationStatus = privateRuntime
      ? "private_runtime"
      : unsafe
        ? "unsafe"
        : !hash
          ? "missing_hash"
          : safetyLabel === "validated"
            ? "validated"
            : "unvalidated";
    return {
      kind: stringValue(item.kind, "artifact"),
      task_id: nullableStringValue(item.task_id),
      uri: nullableStringValue(item.uri),
      hash,
      checksum: nullableStringValue(item.checksum),
      safety_label: safetyLabel,
      validation_status: validationStatus,
      displayable: validationStatus === "validated",
    };
  });

const objectValue = (value: unknown): JsonObject => (
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {}
);

const stringArrayValue = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []
);

const stringValue = (value: unknown, fallback: string): string => (
  typeof value === "string" && value.length > 0 ? value : fallback
);

const nullableStringValue = (value: unknown): string | null => (
  typeof value === "string" && value.length > 0 ? value : null
);

const numberValue = (value: unknown, fallback: number): number => (
  typeof value === "number" && Number.isFinite(value) ? value : fallback
);
