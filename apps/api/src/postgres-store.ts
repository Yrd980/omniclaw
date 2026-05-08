import { and, eq } from "drizzle-orm";
import { agents, reputationEvents, settlementEvents, skills, taskResults, tasks, type DatabaseConnection } from "@omniclaw/db";
import type { DataStore } from "./store";
import type { Agent, ReputationEvent, SettlementEvent, Skill, Task, TaskResult } from "./types";

type DrizzleDb = DatabaseConnection["db"];

export type PostgresStore = DataStore;

export const createPostgresStore = (db: DrizzleDb): PostgresStore => ({
  agents: new Map(),
  skills: new Map(),
  tasks: new Map(),
  taskResults: new Map(),
  reputationEvents: new Map(),
  settlementEvents: new Map(),
  nextId(prefix: string) {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  },
  now() {
    return new Date().toISOString();
  },
  async getAgent(id: string) {
    const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    return row ? agentFromRow(row) : undefined;
  },
  async saveAgent(agent: Agent) {
    await db.insert(agents).values(agentToRow(agent)).onConflictDoUpdate({
      target: agents.id,
      set: agentToRow(agent),
    });
  },
  async listAgents() {
    return (await db.select().from(agents)).map(agentFromRow);
  },
  async getSkill(id: string) {
    const [row] = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
    return row ? skillFromRow(row) : undefined;
  },
  async findSkillByAgentName(agentId: string, name: string) {
    const [row] = await db.select().from(skills).where(and(eq(skills.agentId, agentId), eq(skills.name, name))).limit(1);
    return row ? skillFromRow(row) : undefined;
  },
  async saveSkill(skill: Skill) {
    await db.insert(skills).values(skillToRow(skill)).onConflictDoUpdate({
      target: skills.id,
      set: skillToRow(skill),
    });
  },
  async listSkills() {
    return (await db.select().from(skills)).map(skillFromRow);
  },
  async getTask(id: string) {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return row ? taskFromRow(row) : undefined;
  },
  async saveTask(task: Task) {
    await db.insert(tasks).values(taskToRow(task)).onConflictDoUpdate({
      target: tasks.id,
      set: taskToRow(task),
    });
  },
  async listTasks() {
    return (await db.select().from(tasks)).map(taskFromRow);
  },
  async saveTaskResult(taskResult: TaskResult) {
    await db.insert(taskResults).values(taskResultToRow(taskResult)).onConflictDoUpdate({
      target: taskResults.id,
      set: taskResultToRow(taskResult),
    });
  },
  async getTaskResultForTask(taskId: string) {
    const [row] = await db.select().from(taskResults).where(eq(taskResults.taskId, taskId)).limit(1);
    return row ? taskResultFromRow(row) : undefined;
  },
  async saveReputationEvent(reputationEvent: ReputationEvent) {
    await db.insert(reputationEvents).values(reputationEventToRow(reputationEvent)).onConflictDoNothing();
  },
  async listReputationEvents() {
    return (await db.select().from(reputationEvents)).map(reputationEventFromRow);
  },
  async saveSettlementEvent(settlementEvent: SettlementEvent) {
    await db.insert(settlementEvents).values(settlementEventToRow(settlementEvent)).onConflictDoNothing();
  },
  async listSettlementEvents() {
    return (await db.select().from(settlementEvents)).map(settlementEventFromRow);
  },
  async listSettlementEventsForTask(taskId: string) {
    return (await db.select().from(settlementEvents).where(eq(settlementEvents.taskId, taskId))).map(settlementEventFromRow);
  },
  async hasSettlementEvent(taskId: string, eventType: SettlementEvent["eventType"]) {
    const [row] = await db
      .select({ id: settlementEvents.id })
      .from(settlementEvents)
      .where(and(eq(settlementEvents.taskId, taskId), eq(settlementEvents.eventType, eventType)))
      .limit(1);
    return Boolean(row);
  },
});

const toDate = (value: string | null): Date | null => (value ? new Date(value) : null);
const toIso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value);
const jsonObject = (value: unknown) => (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {});
const jsonArray = (value: unknown) => (Array.isArray(value) ? value : []);

const agentToRow = (agent: Agent) => ({
  id: agent.id,
  publisherWallet: agent.publisherWallet,
  name: agent.name,
  description: agent.description,
  status: agent.status,
  reputationScore: agent.reputationScore,
  successRate: agent.successRate,
  avgLatencyMs: agent.avgLatencyMs,
  qualityScore: agent.qualityScore,
  delegationSuccessRate: agent.delegationSuccessRate,
  historicalEarningsLamports: agent.historicalEarningsLamports,
  stakeAmount: agent.stakeAmount,
  createdAt: new Date(agent.createdAt),
  updatedAt: new Date(agent.updatedAt),
});

const agentFromRow = (row: typeof agents.$inferSelect): Agent => ({
  id: row.id,
  publisherWallet: row.publisherWallet,
  name: row.name,
  description: row.description,
  status: row.status as Agent["status"],
  reputationScore: row.reputationScore,
  successRate: row.successRate,
  avgLatencyMs: row.avgLatencyMs,
  qualityScore: row.qualityScore,
  delegationSuccessRate: row.delegationSuccessRate,
  historicalEarningsLamports: row.historicalEarningsLamports,
  stakeAmount: row.stakeAmount,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const skillToRow = (skill: Skill) => ({
  id: skill.id,
  agentId: skill.agentId,
  name: skill.name,
  description: skill.description,
  inputSchema: skill.inputSchema,
  outputSchema: skill.outputSchema,
  basePriceLamports: skill.basePriceLamports,
  estimatedLatencyMs: skill.estimatedLatencyMs,
  requiredPermissions: skill.requiredPermissions,
  createdAt: new Date(skill.createdAt),
  updatedAt: new Date(skill.updatedAt),
});

const skillFromRow = (row: typeof skills.$inferSelect): Skill => ({
  id: row.id,
  agentId: row.agentId,
  name: row.name,
  description: row.description,
  inputSchema: jsonObject(row.inputSchema),
  outputSchema: jsonObject(row.outputSchema),
  basePriceLamports: row.basePriceLamports,
  estimatedLatencyMs: row.estimatedLatencyMs,
  requiredPermissions: row.requiredPermissions as string[],
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const taskToRow = (task: Task) => ({
  id: task.id,
  parentTaskId: task.parentTaskId,
  hirerAgentId: task.hirerAgentId,
  workerAgentId: task.workerAgentId,
  skillId: task.skillId,
  taskPayload: task.taskPayload,
  paymentLamports: task.paymentLamports,
  platformFeeLamports: task.platformFeeLamports,
  runtimeFeeLamports: task.runtimeFeeLamports,
  workerPayoutLamports: task.workerPayoutLamports,
  deadline: new Date(task.deadline),
  status: task.status,
  escrowAccount: task.escrowAccount,
  escrowTxSignature: task.escrowTxSignature,
  settlementTxSignature: task.settlementTxSignature,
  acceptedAt: toDate(task.acceptedAt),
  submittedAt: toDate(task.submittedAt),
  completedAt: toDate(task.completedAt),
  createdAt: new Date(task.createdAt),
  updatedAt: new Date(task.updatedAt),
});

const taskFromRow = (row: typeof tasks.$inferSelect): Task => ({
  id: row.id,
  parentTaskId: row.parentTaskId,
  hirerAgentId: row.hirerAgentId,
  workerAgentId: row.workerAgentId,
  skillId: row.skillId,
  taskPayload: jsonObject(row.taskPayload),
  paymentLamports: row.paymentLamports,
  platformFeeLamports: row.platformFeeLamports,
  runtimeFeeLamports: row.runtimeFeeLamports,
  workerPayoutLamports: row.workerPayoutLamports,
  deadline: toIso(row.deadline),
  status: row.status as Task["status"],
  escrowAccount: row.escrowAccount,
  escrowTxSignature: row.escrowTxSignature,
  settlementTxSignature: row.settlementTxSignature,
  acceptedAt: row.acceptedAt ? toIso(row.acceptedAt) : null,
  submittedAt: row.submittedAt ? toIso(row.submittedAt) : null,
  completedAt: row.completedAt ? toIso(row.completedAt) : null,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const taskResultToRow = (taskResult: TaskResult) => ({
  id: taskResult.id,
  taskId: taskResult.taskId,
  workerAgentId: taskResult.workerAgentId,
  resultPayload: taskResult.resultPayload,
  artifacts: taskResult.artifacts,
  qualityScore: taskResult.qualityScore,
  submittedAt: new Date(taskResult.submittedAt),
});

const taskResultFromRow = (row: typeof taskResults.$inferSelect): TaskResult => ({
  id: row.id,
  taskId: row.taskId,
  workerAgentId: row.workerAgentId,
  resultPayload: jsonObject(row.resultPayload),
  artifacts: jsonArray(row.artifacts),
  qualityScore: row.qualityScore,
  submittedAt: toIso(row.submittedAt),
});

const reputationEventToRow = (event: ReputationEvent) => ({
  id: event.id,
  agentId: event.agentId,
  taskId: event.taskId,
  success: event.success,
  latencyMs: event.latencyMs,
  qualityScore: event.qualityScore,
  reviewScore: event.reviewScore,
  delegationSuccess: event.delegationSuccess,
  reputationDelta: event.reputationDelta,
  reason: event.reason,
  createdAt: new Date(event.createdAt),
});

const reputationEventFromRow = (row: typeof reputationEvents.$inferSelect): ReputationEvent => ({
  id: row.id,
  agentId: row.agentId,
  taskId: row.taskId,
  success: row.success,
  latencyMs: row.latencyMs,
  qualityScore: row.qualityScore,
  reviewScore: row.reviewScore,
  delegationSuccess: row.delegationSuccess,
  reputationDelta: row.reputationDelta,
  reason: row.reason,
  createdAt: toIso(row.createdAt),
});

const settlementEventToRow = (event: SettlementEvent) => ({
  id: event.id,
  taskId: event.taskId,
  eventType: event.eventType,
  amountLamports: event.amountLamports,
  fromWallet: event.fromWallet,
  toWallet: event.toWallet,
  txSignature: event.txSignature,
  failureReason: event.failureReason,
  createdAt: new Date(event.createdAt),
});

const settlementEventFromRow = (row: typeof settlementEvents.$inferSelect): SettlementEvent => ({
  id: row.id,
  taskId: row.taskId,
  eventType: row.eventType as SettlementEvent["eventType"],
  amountLamports: row.amountLamports,
  fromWallet: row.fromWallet,
  toWallet: row.toWallet,
  txSignature: row.txSignature,
  failureReason: row.failureReason,
  createdAt: toIso(row.createdAt),
});
