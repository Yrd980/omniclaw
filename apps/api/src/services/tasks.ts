import type { SettlementAdapter } from "../adapters/settlement";
import type { RuntimeAdapter } from "../adapters/runtime";
import type { FeeConfig } from "../config";
import { invariant } from "../errors";
import type { DataStore } from "../store";
import type { Actor, JsonObject, ReputationEvent, SettlementEvent, Task, TaskResult, TaskStatus } from "../types";
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
  invariant(actor.agentId === input.hirer_agent_id || actor.role === "admin", 403, "hirer authorization required");
  const hirer = store.agents.get(input.hirer_agent_id);
  const worker = store.agents.get(input.worker_agent_id);
  const skill = store.skills.get(input.skill_id);
  invariant(hirer, 404, "hirer agent not found");
  invariant(worker, 404, "worker agent not found");
  invariant(skill, 404, "skill not found");
  invariant(skill.agentId === worker.id, 400, "skill does not belong to worker");
  invariant(toTime(input.deadline) > toTime(store.now()), 400, "deadline must be in the future");
  if (input.parent_task_id) {
    validateParent(store, input.parent_task_id, input.deadline);
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
  store.tasks.set(task.id, task);

  const lock = await settlement.lockEscrow(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet });
  applyTransition(task, "escrow_locked");
  task.escrowAccount = lock.escrowAccount;
  task.escrowTxSignature = lock.txSignature;
  task.updatedAt = store.now();
  storeSettlementEvents(store, lock.events);
  return task;
};

export const acceptTask = async ({ store, runtime }: TaskServiceDeps, actor: Actor, taskId: string): Promise<Task> => {
  const task = mustTask(store, taskId);
  requireWorker(actor, task);
  applyTransition(task, "accepted");
  task.acceptedAt = store.now();
  task.updatedAt = task.acceptedAt;
  const dispatch = await runtime.dispatch(task);
  if (dispatch.accepted) {
    applyTransition(task, "in_progress");
    task.updatedAt = store.now();
  }
  return task;
};

export const rejectTask = async ({ store, settlement }: TaskServiceDeps, actor: Actor, taskId: string): Promise<Task> => {
  const task = mustTask(store, taskId);
  requireWorker(actor, task);
  invariant(task.status === "escrow_locked", 409, "only escrow_locked tasks can be rejected");
  const hirer = store.agents.get(task.hirerAgentId);
  const worker = store.agents.get(task.workerAgentId);
  invariant(hirer && worker, 404, "task agents not found");
  const refund = await settlement.refund(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet });
  applyTransition(task, "cancelled");
  task.settlementTxSignature = refund.txSignature;
  task.updatedAt = store.now();
  storeSettlementEvents(store, refund.events);
  return task;
};

export const submitResult = ({ store }: TaskServiceDeps, actor: Actor, taskId: string, input: { result_payload?: JsonObject; artifacts?: unknown[] }): TaskResult => {
  const task = mustTask(store, taskId);
  requireWorker(actor, task);
  invariant(task.status === "in_progress", 409, "result can only be submitted for in_progress tasks");
  invariant(typeof input.result_payload === "object" && input.result_payload !== null, 400, "result_payload is required");
  const result: TaskResult = {
    id: store.nextId("result"),
    taskId,
    workerAgentId: task.workerAgentId,
    resultPayload: input.result_payload,
    artifacts: input.artifacts ?? [],
    qualityScore: null,
    submittedAt: store.now(),
  };
  store.taskResults.set(result.id, result);
  applyTransition(task, "submitted");
  task.submittedAt = result.submittedAt;
  task.updatedAt = result.submittedAt;
  return result;
};

export const resolveTask = async (
  { store, settlement }: TaskServiceDeps,
  actor: Actor,
  taskId: string,
  input: { resolution: "completed" | "failed" | "disputed"; quality_score?: number; review_score?: number },
): Promise<Task> => {
  const task = mustTask(store, taskId);
  requireHirerOrEvaluator(actor, task);
  invariant(task.status === "submitted" || task.status === "disputed", 409, "task must be submitted or disputed before resolution");
  const hirer = store.agents.get(task.hirerAgentId);
  const worker = store.agents.get(task.workerAgentId);
  invariant(hirer && worker, 404, "task agents not found");

  if (input.resolution === "completed") {
    const payout = await settlement.releasePayout(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet });
    task.settlementTxSignature = payout.txSignature;
    storeSettlementEvents(store, payout.events);
    task.completedAt = store.now();
    createReputationEvents(store, task, true, input.quality_score ?? null, input.review_score ?? null);
  } else if (input.resolution === "failed") {
    const refund = await settlement.refund(task, { hirerWallet: hirer.publisherWallet, workerWallet: worker.publisherWallet });
    task.settlementTxSignature = refund.txSignature;
    storeSettlementEvents(store, refund.events);
    createReputationEvents(store, task, false, input.quality_score ?? null, input.review_score ?? null);
  }
  applyTransition(task, input.resolution);
  task.updatedAt = store.now();
  return task;
};

export const getTaskGraph = (store: DataStore, taskId: string) => {
  const root = findRoot(store, mustTask(store, taskId));
  const nodes: Task[] = [];
  const edges: { from: string; to: string }[] = [];
  const visit = (task: Task) => {
    nodes.push(task);
    for (const child of [...store.tasks.values()].filter((candidate) => candidate.parentTaskId === task.id)) {
      edges.push({ from: task.id, to: child.id });
      visit(child);
    }
  };
  visit(root);
  return {
    rootTaskId: root.id,
    nodes: nodes.map((task) => ({
      taskId: task.id,
      parentTaskId: task.parentTaskId,
      workerAgentId: task.workerAgentId,
      status: task.status,
      paymentLamports: task.paymentLamports,
      workerPayoutLamports: task.workerPayoutLamports,
      deadline: task.deadline,
    })),
    edges,
  };
};

const mustTask = (store: DataStore, taskId: string): Task => {
  const task = store.tasks.get(taskId);
  invariant(task, 404, "task not found");
  return task;
};

const applyTransition = (task: Task, nextStatus: TaskStatus) => {
  invariant(allowedTransitions[task.status].includes(nextStatus), 409, `invalid task transition ${task.status} -> ${nextStatus}`);
  task.status = nextStatus;
};

const validateParent = (store: DataStore, parentTaskId: string, childDeadline: string) => {
  const parent = mustTask(store, parentTaskId);
  invariant(parent.id !== parentTaskId || Boolean(parent), 400, "child task cannot use itself as parent");
  invariant(new Date(childDeadline).getTime() <= new Date(parent.deadline).getTime(), 400, "child deadline cannot exceed parent deadline");
  let current: Task | undefined = parent;
  const seen = new Set<string>();
  while (current) {
    invariant(!seen.has(current.id), 400, "parent task cycle detected");
    seen.add(current.id);
    current = current.parentTaskId ? store.tasks.get(current.parentTaskId) : undefined;
  }
};

const findRoot = (store: DataStore, task: Task): Task => {
  let current = task;
  const seen = new Set<string>();
  while (current.parentTaskId) {
    invariant(!seen.has(current.id), 400, "task graph cycle detected");
    seen.add(current.id);
    current = mustTask(store, current.parentTaskId);
  }
  return current;
};

const storeSettlementEvents = (store: DataStore, events: SettlementEvent[]) => {
  for (const settlementEvent of events) {
    store.settlementEvents.set(`${settlementEvent.id}_${store.settlementEvents.size}`, settlementEvent);
  }
};

const createReputationEvents = (
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
    delegationSuccess: [...store.tasks.values()].some((candidate) => candidate.parentTaskId === task.id && candidate.status === "completed"),
    reputationDelta,
    reason: success ? "task completed" : "task failed",
    createdAt: store.now(),
  };
  store.reputationEvents.set(event.id, event);
};

const toTime = (value: string): number => {
  const time = new Date(value).getTime();
  invariant(Number.isFinite(time), 400, "invalid timestamp");
  return time;
};
