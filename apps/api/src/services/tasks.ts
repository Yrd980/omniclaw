import type { SettlementAdapter } from "../adapters/settlement";
import { runtimeAcceptedTaskPayload, type RuntimeAdapter } from "../adapters/runtime";
import type { FeeConfig } from "../config";
import { invariant } from "../errors";
import type { DataStore } from "../store";
import { taskContractDto, taskProofSummaryDto } from "../task-contracts";
import type { Actor, JsonObject, ReputationEvent, SettlementEvent, Task, TaskResult, TaskStatus } from "../types";
import { validatePayloadAgainstSchema } from "../validation";
import { requireHirerOrEvaluator, requireWorker } from "./authorization";
import { calculateFees } from "./fees";

export const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  created: ["escrow_locked", "cancelled"],
  escrow_locked: ["accepted", "cancelled", "expired"],
  accepted: ["in_progress", "failed", "expired"],
  in_progress: ["submitted", "failed", "expired"],
  submitted: ["completed", "disputed", "failed"],
  disputed: ["completed", "failed"],
  completed: [],
  failed: [],
  expired: [],
  cancelled: [],
};

export type TaskServiceDeps = {
  store: DataStore;
  settlement: SettlementAdapter;
  runtime: RuntimeAdapter;
  feeConfig?: FeeConfig;
};

export type CreateTaskInput = {
  parent_task_id?: string | null;
  hirer_agent_id: string;
  worker_agent_id: string;
  skill_id: string;
  task_payload?: JsonObject;
  payment_lamports: string;
  deadline: string;
};

export const createTask = async ({ store, settlement, feeConfig }: TaskServiceDeps, actor: Actor, input: CreateTaskInput): Promise<Task> => {
  invariant(actor.agentId === input.hirer_agent_id || actor.role === "admin", 403, "FORBIDDEN", "hirer authorization required");
  const hirer = await store.getAgent(input.hirer_agent_id);
  const worker = await store.getAgent(input.worker_agent_id);
  const skill = await store.getSkill(input.skill_id);
  invariant(hirer, 404, "NOT_FOUND", "hirer agent not found");
  invariant(worker, 404, "NOT_FOUND", "worker agent not found");
  invariant(skill, 404, "NOT_FOUND", "skill not found");
  invariant(skill.agentId === worker.id, 400, "INVALID_BODY", "skill does not belong to worker");
  invariant(toTime(input.deadline) > toTime(store.now()), 400, "INVALID_BODY", "deadline must be in the future");
  validatePayloadAgainstSchema(input.task_payload ?? {}, skill.inputSchema, "task_payload");
  if (input.parent_task_id) {
    await validateParent(store, input.parent_task_id, input.deadline);
  }

  const fees = calculateFees(input.payment_lamports, feeConfig);
  const now = store.now();
  const task: Task = {
    id: store.nextId("task"),
    parentTaskId: input.parent_task_id ?? null,
    hirerAgentId: input.hirer_agent_id,
    workerAgentId: input.worker_agent_id,
    skillId: input.skill_id,
    taskPayload: input.task_payload ?? {},
    ...fees,
    deadline: input.deadline,
    status: "created",
    escrowAccount: null,
    escrowTxSignature: null,
    settlementTxSignature: null,
    acceptedAt: null,
    submittedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await store.saveTask(task);

  const lock = await settlement.lockEscrow(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet });
  applyTransition(task, "escrow_locked");
  task.escrowAccount = lock.escrowAccount;
  task.escrowTxSignature = lock.txSignature;
  task.updatedAt = store.now();
  await store.saveTask(task);
  await storeSettlementEvents(store, lock.events);
  return task;
};

export const acceptTask = async ({ store, runtime }: TaskServiceDeps, actor: Actor, taskId: string): Promise<Task> => {
  const task = await mustTask(store, taskId);
  requireWorker(actor, task);
  applyTransition(task, "accepted");
  task.acceptedAt = store.now();
  task.updatedAt = task.acceptedAt;
  await store.saveTask(task);
  let dispatch;
  try {
    dispatch = await runtime.dispatch(runtimeAcceptedTaskPayload(task));
  } catch (error) {
    await failAcceptedTask(store, task);
    throw error;
  }
  if (dispatch.accepted) {
    applyTransition(task, "in_progress");
    task.updatedAt = store.now();
    await store.saveTask(task);
    if (shouldSubmitRuntimeResult(task, dispatch)) {
      await submitRuntimeResult(store, task, dispatch.resultPayload, dispatch.artifacts);
    }
  } else {
    await failAcceptedTask(store, task);
  }
  return task;
};

export const rejectTask = async ({ store, settlement }: TaskServiceDeps, actor: Actor, taskId: string): Promise<Task> => {
  const task = await mustTask(store, taskId);
  requireWorker(actor, task);
  invariant(task.status === "escrow_locked", 409, "CONFLICT", "only escrow_locked tasks can be rejected");
  const hirer = await store.getAgent(task.hirerAgentId);
  const worker = await store.getAgent(task.workerAgentId);
  invariant(hirer && worker, 404, "NOT_FOUND", "task agents not found");
  const refund = await settlement.refund(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet });
  applyTransition(task, "cancelled");
  task.settlementTxSignature = refund.txSignature;
  task.updatedAt = store.now();
  await store.saveTask(task);
  await storeSettlementEvents(store, refund.events);
  return task;
};

export const submitResult = async (
  { store }: TaskServiceDeps,
  actor: Actor,
  taskId: string,
  input: { result_payload?: JsonObject; artifacts?: unknown[] },
): Promise<TaskResult> => {
  const task = await mustTask(store, taskId);
  requireWorker(actor, task);
  invariant(task.status === "in_progress", 409, "CONFLICT", "result can only be submitted for in_progress tasks");
  invariant(typeof input.result_payload === "object" && input.result_payload !== null, 400, "INVALID_BODY", "result_payload is required");
  invariant(!Array.isArray(input.result_payload), 400, "INVALID_BODY", "result_payload must be a JSON object");
  invariant(input.artifacts === undefined || Array.isArray(input.artifacts), 400, "INVALID_BODY", "artifacts must be an array");
  const skill = await store.getSkill(task.skillId);
  invariant(skill, 404, "NOT_FOUND", "task skill not found");
  validatePayloadAgainstSchema(input.result_payload, skill.outputSchema, "result_payload");
  const result: TaskResult = {
    id: store.nextId("result"),
    taskId,
    workerAgentId: task.workerAgentId,
    resultPayload: input.result_payload,
    artifacts: input.artifacts ?? [],
    qualityScore: null,
    submittedAt: store.now(),
  };
  await store.saveTaskResult(result);
  applyTransition(task, "submitted");
  task.submittedAt = result.submittedAt;
  task.updatedAt = result.submittedAt;
  await store.saveTask(task);
  return result;
};

export const resolveTask = async (
  { store, settlement }: TaskServiceDeps,
  actor: Actor,
  taskId: string,
  input: { resolution: "completed" | "failed" | "disputed"; quality_score?: number; review_score?: number },
): Promise<Task> => {
  const task = await mustTask(store, taskId);
  requireHirerOrEvaluator(actor, task);
  invariant(task.status === "submitted" || task.status === "disputed", 409, "CONFLICT", "task must be submitted or disputed before resolution");
  const hirer = await store.getAgent(task.hirerAgentId);
  const worker = await store.getAgent(task.workerAgentId);
  invariant(hirer && worker, 404, "NOT_FOUND", "task agents not found");

  if (input.resolution === "completed") {
    const payout = await withSettlementFailureAudit(store, settlement, task, "release payout failed", () =>
      settlement.releasePayout(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet })
    );
    task.settlementTxSignature = payout.txSignature;
    await storeSettlementEvents(store, payout.events);
    task.completedAt = store.now();
    await createReputationEvents(store, task, true, input.quality_score ?? null, input.review_score ?? null);
  } else if (input.resolution === "failed") {
    const refund = await withSettlementFailureAudit(store, settlement, task, "refund failed", () =>
      settlement.refund(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet })
    );
    task.settlementTxSignature = refund.txSignature;
    await storeSettlementEvents(store, refund.events);
    await createReputationEvents(store, task, false, input.quality_score ?? null, input.review_score ?? null);
  }
  applyTransition(task, input.resolution);
  task.updatedAt = store.now();
  await store.saveTask(task);
  return task;
};

export const expireTask = async ({ store, settlement }: TaskServiceDeps, actor: Actor, taskId: string): Promise<Task> => {
  invariant(actor.role === "admin" || actor.role === "evaluator", 403, "FORBIDDEN", "admin or evaluator authorization required");
  const task = await mustTask(store, taskId);
  invariant(toTime(task.deadline) <= toTime(store.now()), 409, "CONFLICT", "task deadline has not passed");
  const hirer = await store.getAgent(task.hirerAgentId);
  const worker = await store.getAgent(task.workerAgentId);
  invariant(hirer && worker, 404, "NOT_FOUND", "task agents not found");

  if (task.status === "submitted") {
    applyTransition(task, "disputed");
    task.updatedAt = store.now();
    await store.saveTask(task);
    return task;
  }

  invariant(["escrow_locked", "accepted", "in_progress"].includes(task.status), 409, "CONFLICT", "task cannot be expired from current status");
  const refund = await withSettlementFailureAudit(store, settlement, task, "expiration refund failed", () =>
    settlement.refund(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet })
  );
  applyTransition(task, "expired");
  task.settlementTxSignature = refund.txSignature;
  task.updatedAt = store.now();
  await store.saveTask(task);
  await storeSettlementEvents(store, refund.events);
  return task;
};

export const getTaskGraph = async (store: DataStore, taskId: string) => {
  const root = await findRoot(store, await mustTask(store, taskId));
  const nodes: Task[] = [];
  const edges: { from: string; to: string }[] = [];
  const allTasks = await store.listTasks();
  const visit = (task: Task) => {
    nodes.push(task);
    for (const child of allTasks.filter((candidate) => candidate.parentTaskId === task.id)) {
      edges.push({ from: task.id, to: child.id });
      visit(child);
    }
  };
  visit(root);
  return {
    rootTaskId: root.id,
    nodes: await Promise.all(nodes.map(async (task) => {
      const contract = taskContractDto(task);
      return {
        taskId: task.id,
        parentTaskId: task.parentTaskId,
        workerAgentId: task.workerAgentId,
        skillId: task.skillId,
        status: task.status,
        paymentLamports: task.paymentLamports,
        workerPayoutLamports: task.workerPayoutLamports,
        deadline: task.deadline,
        taskPack: contract.task_pack,
        privacyLevel: contract.privacy_level,
        proof: taskProofSummaryDto(
          task,
          await store.getTaskResultForTask(task.id),
          await store.listSettlementEventsByFilters({ taskId: task.id }),
        ),
      };
    })),
    edges,
  };
};

const mustTask = async (store: DataStore, taskId: string): Promise<Task> => {
  const task = await store.getTask(taskId);
  invariant(task, 404, "NOT_FOUND", "task not found");
  return task;
};

const applyTransition = (task: Task, nextStatus: TaskStatus) => {
  invariant(allowedTransitions[task.status].includes(nextStatus), 409, "CONFLICT", `invalid task transition ${task.status} -> ${nextStatus}`);
  task.status = nextStatus;
};

const validateParent = async (store: DataStore, parentTaskId: string, childDeadline: string) => {
  const parent = await mustTask(store, parentTaskId);
  invariant(parent.id !== parentTaskId || Boolean(parent), 400, "INVALID_BODY", "child task cannot use itself as parent");
  invariant(new Date(childDeadline).getTime() <= new Date(parent.deadline).getTime(), 400, "INVALID_BODY", "child deadline cannot exceed parent deadline");
  let current: Task | undefined = parent;
  const seen = new Set<string>();
  while (current) {
    invariant(!seen.has(current.id), 400, "INVALID_BODY", "parent task cycle detected");
    seen.add(current.id);
    current = current.parentTaskId ? await store.getTask(current.parentTaskId) : undefined;
  }
};

const findRoot = async (store: DataStore, task: Task): Promise<Task> => {
  let current = task;
  const seen = new Set<string>();
  while (current.parentTaskId) {
    invariant(!seen.has(current.id), 400, "INVALID_BODY", "task graph cycle detected");
    seen.add(current.id);
    current = await mustTask(store, current.parentTaskId);
  }
  return current;
};

const storeSettlementEvents = async (store: DataStore, events: SettlementEvent[]) => {
  for (const settlementEvent of events) {
    if (!(await store.hasSettlementEvent(settlementEvent.taskId, settlementEvent.eventType))) {
      await store.saveSettlementEvent(settlementEvent);
    }
  }
};

const withSettlementFailureAudit = async <T extends { txSignature: string; events: SettlementEvent[] }>(
  store: DataStore,
  settlement: SettlementAdapter,
  task: Task,
  operation: string,
  action: () => Promise<T>,
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    const reason = `${operation}: ${errorMessage(error)}`;
    const failure = await settlement.recordFailure(task, reason);
    await storeSettlementEvents(store, failure.events);
    throw error;
  }
};

const failAcceptedTask = async (store: DataStore, task: Task) => {
  if (task.status === "accepted") {
    applyTransition(task, "failed");
    task.updatedAt = store.now();
    await store.saveTask(task);
  }
};

const shouldSubmitRuntimeResult = (
  task: Task,
  dispatch: { submitResult?: boolean; resultPayload?: JsonObject },
): dispatch is { submitResult: true; resultPayload: JsonObject } =>
  dispatch.submitResult === true
  && Boolean(dispatch.resultPayload)
  && task.taskPayload.runtime_submit_result !== false;

const submitRuntimeResult = async (
  store: DataStore,
  task: Task,
  resultPayload: JsonObject,
  artifacts: unknown[] | undefined,
) => {
  const skill = await store.getSkill(task.skillId);
  invariant(skill, 404, "NOT_FOUND", "task skill not found");
  validatePayloadAgainstSchema(resultPayload, skill.outputSchema, "result_payload");
  const result: TaskResult = {
    id: store.nextId("result"),
    taskId: task.id,
    workerAgentId: task.workerAgentId,
    resultPayload,
    artifacts: artifacts ?? [],
    qualityScore: null,
    submittedAt: store.now(),
  };
  await store.saveTaskResult(result);
  applyTransition(task, "submitted");
  task.submittedAt = result.submittedAt;
  task.updatedAt = result.submittedAt;
  await store.saveTask(task);
};

const createReputationEvents = async (
  store: DataStore,
  task: Task,
  success: boolean,
  qualityScore: number | null,
  reviewScore: number | null,
) => {
  const acceptedAt = task.acceptedAt ? toTime(task.acceptedAt) : toTime(task.createdAt);
  const completedAt = toTime(store.now());
  const reputationDelta = success ? Math.max(1, Math.round((qualityScore ?? 80) / 20)) : -5;
  const event: ReputationEvent = {
    id: store.nextId("rep"),
    agentId: task.workerAgentId,
    taskId: task.id,
    success,
    latencyMs: Math.max(0, completedAt - acceptedAt),
    qualityScore,
    reviewScore,
    delegationSuccess: (await store.listTasks()).some((candidate) => candidate.parentTaskId === task.id && candidate.status === "completed"),
    reputationDelta,
    reason: success ? "task completed" : "task failed",
    createdAt: store.now(),
  };
  await store.saveReputationEvent(event);
};

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const toTime = (value: string): number => {
  const time = new Date(value).getTime();
  invariant(Number.isFinite(time), 400, "INVALID_BODY", "invalid timestamp");
  return time;
};
