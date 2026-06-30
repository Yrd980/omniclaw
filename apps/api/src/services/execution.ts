import { invariant } from "../errors";
import type { DataStore } from "../store";
import type { Actor, ExecutionQueueItem, ExecutionStatus, Task } from "../types";

export const enqueueTask = async (
  store: DataStore,
  taskId: string,
  options?: { timeout_ms?: number; runtime_adapter?: string },
): Promise<ExecutionQueueItem> => {
  const task = await store.getTask(taskId);
  invariant(task, 404, "NOT_FOUND", "task not found");
  invariant(task.status === "accepted", 409, "CONFLICT", "task must be accepted to enqueue");

  const existing = await store.getExecutionQueueItemByTaskId(taskId);
  if (existing && ["queued", "running"].includes(existing.status)) {
    return existing;
  }

  const now = store.now();
  const item: ExecutionQueueItem = {
    id: store.nextId("exec"),
    taskId,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    nextRetryAt: null,
    startedAt: null,
    completedAt: null,
    timeoutMs: options?.timeout_ms ?? 300000,
    runtimeAdapter: options?.runtime_adapter ?? null,
    createdAt: now,
  };

  await store.saveExecutionQueueItem(item);
  return item;
};

export const startExecution = async (
  store: DataStore,
  executionId: string,
): Promise<ExecutionQueueItem> => {
  const item = await store.getExecutionQueueItem(executionId);
  invariant(item, 404, "NOT_FOUND", "execution queue item not found");
  invariant(item.status === "queued", 409, "CONFLICT", "execution must be queued to start");

  const now = store.now();
  const updated: ExecutionQueueItem = {
    ...item,
    status: "running",
    attempts: item.attempts + 1,
    startedAt: now,
  };

  await store.updateExecutionQueueItem(updated);

  const task = await store.getTask(item.taskId);
  if (task && task.status === "accepted") {
    task.status = "in_progress";
    task.updatedAt = now;
    await store.saveTask(task);
  }

  return updated;
};

export const completeExecution = async (
  store: DataStore,
  executionId: string,
  success: boolean,
  error?: string,
): Promise<ExecutionQueueItem> => {
  const item = await store.getExecutionQueueItem(executionId);
  invariant(item, 404, "NOT_FOUND", "execution queue item not found");
  invariant(item.status === "running", 409, "CONFLICT", "execution must be running to complete");

  const now = store.now();
  const updated: ExecutionQueueItem = {
    ...item,
    status: success ? "completed" : "failed",
    completedAt: now,
    lastError: error ?? item.lastError,
  };

  await store.updateExecutionQueueItem(updated);

  if (!success && item.attempts < item.maxAttempts) {
    const retryDelay = Math.min(1000 * Math.pow(2, item.attempts), 60000);
    const retryItem: ExecutionQueueItem = {
      ...updated,
      status: "queued",
      nextRetryAt: new Date(Date.now() + retryDelay).toISOString(),
    };
    await store.updateExecutionQueueItem(retryItem);
    return retryItem;
  }

  if (!success) {
    const task = await store.getTask(item.taskId);
    if (task && task.status === "in_progress") {
      task.status = "failed";
      task.updatedAt = now;
      await store.saveTask(task);
    }
  }

  return updated;
};

export const cancelExecution = async (
  store: DataStore,
  executionId: string,
): Promise<ExecutionQueueItem> => {
  const item = await store.getExecutionQueueItem(executionId);
  invariant(item, 404, "NOT_FOUND", "execution queue item not found");
  invariant(item.status === "queued" || item.status === "running", 409, "CONFLICT", "execution must be queued or running to cancel");

  const now = store.now();
  const updated: ExecutionQueueItem = {
    ...item,
    status: "cancelled",
    completedAt: now,
  };

  await store.updateExecutionQueueItem(updated);

  const task = await store.getTask(item.taskId);
  if (task && task.status === "in_progress") {
    task.status = "failed";
    task.updatedAt = now;
    await store.saveTask(task);
  }

  return updated;
};

export const getExecutionQueue = async (
  store: DataStore,
  filters: { task_id?: string; status?: string },
): Promise<ExecutionQueueItem[]> => {
  return store.listExecutionQueueItems({
    taskId: filters.task_id,
    status: filters.status,
  });
};

export const getStuckExecutions = async (store: DataStore): Promise<ExecutionQueueItem[]> => {
  const running = await store.listExecutionQueueItems({ status: "running" });
  const now = Date.now();

  return running.filter((item) => {
    if (!item.startedAt) return false;
    const elapsed = now - new Date(item.startedAt).getTime();
    return elapsed > item.timeoutMs;
  });
};

export const cleanupTimedOutExecutions = async (store: DataStore): Promise<number> => {
  const stuck = await getStuckExecutions(store);
  let cleaned = 0;

  for (const item of stuck) {
    await completeExecution(store, item.id, false, "execution timed out");
    cleaned++;
  }

  return cleaned;
};
