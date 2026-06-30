import { invariant } from "../errors";
import type { DataStore } from "../store";
import type { Actor, Agent, SettlementEvent } from "../types";

export type SettlementFailureDto = {
  task_id: string;
  event_id: string;
  event_type: string;
  amount_lamports: string;
  failure_reason: string | null;
  tx_signature: string;
  created_at: string;
};

export type AgentSuspensionDto = {
  agent_id: string;
  name: string;
  status: string;
  unsafe_artifact_rate: number;
  dispute_rate: number;
  total_disputes: number;
  total_tasks_completed: number;
};

export const getSettlementFailures = async (store: DataStore): Promise<SettlementFailureDto[]> => {
  const allEvents = await store.listSettlementEvents();
  return allEvents
    .filter((event) => event.eventType === "settlement_failed" || event.failureReason)
    .map((event) => ({
      task_id: event.taskId,
      event_id: event.id,
      event_type: event.eventType,
      amount_lamports: event.amountLamports,
      failure_reason: event.failureReason,
      tx_signature: event.txSignature,
      created_at: event.createdAt,
    }));
};

export const retrySettlementEvent = async (
  store: DataStore,
  actor: Actor,
  eventId: string,
): Promise<{ success: boolean; message: string }> => {
  invariant(actor.role === "admin", 403, "FORBIDDEN", "admin authorization required");

  const allEvents = await store.listSettlementEvents();
  const event = allEvents.find((e) => e.id === eventId);
  invariant(event, 404, "NOT_FOUND", "settlement event not found");
  invariant(event.eventType === "settlement_failed", 409, "CONFLICT", "can only retry failed settlement events");

  const task = await store.getTask(event.taskId);
  invariant(task, 404, "NOT_FOUND", "task not found");

  const now = store.now();
  const retryEvent: SettlementEvent = {
    id: store.nextId("settle"),
    taskId: event.taskId,
    eventType: event.eventType,
    amountLamports: event.amountLamports,
    fromWallet: event.fromWallet,
    toWallet: event.toWallet,
    txSignature: `retry_${event.txSignature}_${Date.now()}`,
    failureReason: null,
    confirmationStatus: "retrying",
    createdAt: now,
  };

  await store.saveSettlementEvent(retryEvent);

  return {
    success: true,
    message: `Settlement retry initiated for task ${event.taskId}`,
  };
};

export const getAgentSuspensions = async (store: DataStore): Promise<AgentSuspensionDto[]> => {
  const agents = await store.listAgents();
  return agents
    .filter((agent) =>
      agent.unsafeArtifactRate > 0.2 ||
      agent.disputeRate > 0.3 ||
      agent.totalDisputes > 5
    )
    .map((agent) => ({
      agent_id: agent.id,
      name: agent.name,
      status: agent.status,
      unsafe_artifact_rate: agent.unsafeArtifactRate,
      dispute_rate: agent.disputeRate,
      total_disputes: agent.totalDisputes,
      total_tasks_completed: agent.totalTasksCompleted,
    }));
};

export const suspendAgent = async (
  store: DataStore,
  actor: Actor,
  agentId: string,
): Promise<Agent> => {
  invariant(actor.role === "admin", 403, "FORBIDDEN", "admin authorization required");

  const agent = await store.getAgent(agentId);
  invariant(agent, 404, "NOT_FOUND", "agent not found");

  const updated: Agent = {
    ...agent,
    status: "suspended",
    updatedAt: store.now(),
  };

  await store.saveAgent(updated);
  return updated;
};

export const reactivateAgent = async (
  store: DataStore,
  actor: Actor,
  agentId: string,
): Promise<Agent> => {
  invariant(actor.role === "admin", 403, "FORBIDDEN", "admin authorization required");

  const agent = await store.getAgent(agentId);
  invariant(agent, 404, "NOT_FOUND", "agent not found");
  invariant(agent.status === "suspended", 409, "CONFLICT", "agent is not suspended");

  const updated: Agent = {
    ...agent,
    status: "active",
    updatedAt: store.now(),
  };

  await store.saveAgent(updated);
  return updated;
};

export const getOperatorStats = async (store: DataStore) => {
  const tasks = await store.listTasks();
  const agents = await store.listAgents();
  const disputes = await store.listDisputes({});
  const settlementEvents = await store.listSettlementEvents();

  const failedSettlements = settlementEvents.filter((e) => e.eventType === "settlement_failed");
  const openDisputes = disputes.filter((d) => d.status === "opened" || d.status === "under_review");
  const suspendedAgents = agents.filter((a) => a.status === "suspended");

  return {
    total_tasks: tasks.length,
    active_tasks: tasks.filter((t) => !["completed", "failed", "expired", "cancelled"].includes(t.status)).length,
    total_agents: agents.length,
    active_agents: agents.filter((a) => a.status === "active").length,
    suspended_agents: suspendedAgents.length,
    open_disputes: openDisputes.length,
    total_disputes: disputes.length,
    failed_settlements: failedSettlements.length,
    total_settlements: settlementEvents.length,
  };
};
