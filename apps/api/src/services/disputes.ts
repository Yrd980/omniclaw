import { invariant } from "../errors";
import type { DataStore } from "../store";
import type { Actor, Dispute, DisputeResolution, DisputeStatus, Task } from "../types";

export type OpenDisputeInput = {
  reason: string;
};

export type ResolveDisputeInput = {
  resolution: DisputeResolution;
  resolution_notes?: string;
  settlement_action?: "release_payout" | "refund" | "split";
  quality_score?: number;
  review_score?: number;
};

export const openDispute = async (
  store: DataStore,
  actor: Actor,
  taskId: string,
  input: OpenDisputeInput,
): Promise<Dispute> => {
  const task = await store.getTask(taskId);
  invariant(task, 404, "NOT_FOUND", "task not found");
  invariant(
    actor.agentId === task.hirerAgentId ||
    actor.agentId === task.workerAgentId ||
    actor.role === "admin" ||
    actor.role === "evaluator",
    403,
    "FORBIDDEN",
    "authorization required",
  );
  invariant(task.status === "submitted" || task.status === "disputed", 409, "CONFLICT", "task must be submitted or disputed to open dispute");
  invariant(input.reason && input.reason.length >= 10, 400, "INVALID_BODY", "reason must be at least 10 characters");

  const existingDisputes = await store.listDisputes({ taskId, status: "opened" });
  invariant(existingDisputes.length === 0, 409, "CONFLICT", "an open dispute already exists for this task");

  const now = store.now();
  const dispute: Dispute = {
    id: store.nextId("dispute"),
    taskId,
    openedBy: actor.agentId!,
    reason: input.reason,
    status: "opened",
    evaluatorAgentId: null,
    resolution: null,
    resolutionNotes: null,
    settlementAction: null,
    openedAt: now,
    resolvedAt: null,
  };

  await store.saveDispute(dispute);

  if (task.status === "submitted") {
    task.status = "disputed";
    task.updatedAt = now;
    await store.saveTask(task);
  }

  return dispute;
};

export const resolveDispute = async (
  store: DataStore,
  actor: Actor,
  disputeId: string,
  input: ResolveDisputeInput,
): Promise<Dispute> => {
  const dispute = await store.getDispute(disputeId);
  invariant(dispute, 404, "NOT_FOUND", "dispute not found");
  invariant(
    actor.role === "admin" || actor.role === "evaluator",
    403,
    "FORBIDDEN",
    "admin or evaluator authorization required",
  );
  invariant(dispute.status === "opened" || dispute.status === "under_review", 409, "CONFLICT", "dispute must be opened or under_review to resolve");

  const now = store.now();
  const resolved: Dispute = {
    ...dispute,
    status: "resolved",
    evaluatorAgentId: actor.agentId ?? dispute.evaluatorAgentId,
    resolution: input.resolution,
    resolutionNotes: input.resolution_notes ?? null,
    settlementAction: input.settlement_action ?? null,
    resolvedAt: now,
  };

  await store.updateDispute(resolved);

  const task = await store.getTask(dispute.taskId);
  if (task) {
    if (input.resolution === "worker_favored" && task.status === "disputed") {
      task.status = "completed";
      task.completedAt = now;
      task.updatedAt = now;
      await store.saveTask(task);
    } else if (input.resolution === "hirer_favored" && task.status === "disputed") {
      task.status = "failed";
      task.updatedAt = now;
      await store.saveTask(task);
    } else if (input.resolution === "dismissed" && task.status === "disputed") {
      task.status = "submitted";
      task.updatedAt = now;
      await store.saveTask(task);
    }
  }

  return resolved;
};

export const listDisputes = async (
  store: DataStore,
  filters: { task_id?: string; status?: string; evaluator_agent_id?: string },
): Promise<Dispute[]> => {
  return store.listDisputes({
    taskId: filters.task_id,
    status: filters.status,
    evaluatorAgentId: filters.evaluator_agent_id,
  });
};

export const assignEvaluator = async (
  store: DataStore,
  actor: Actor,
  disputeId: string,
): Promise<Dispute> => {
  const dispute = await store.getDispute(disputeId);
  invariant(dispute, 404, "NOT_FOUND", "dispute not found");
  invariant(actor.role === "evaluator" || actor.role === "admin", 403, "FORBIDDEN", "evaluator role required");
  invariant(dispute.status === "opened", 409, "CONFLICT", "dispute must be opened to assign evaluator");

  const updated: Dispute = {
    ...dispute,
    status: "under_review",
    evaluatorAgentId: actor.agentId ?? null,
  };

  await store.updateDispute(updated);
  return updated;
};
