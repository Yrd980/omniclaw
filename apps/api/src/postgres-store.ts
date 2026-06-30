import { and, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import { agents, reputationEvents, settlementEvents, skills, taskResults, tasks, deliveryManifests, artifactChecks, disputes, executionQueue, type DatabaseConnection } from "@omniclaw/db";
import type { DataStore, DisputeFilters, EventFilters, ExecutionQueueFilters, TaskFilters } from "./store";
import type { Agent, ArtifactCheck, DeliveryManifest, Dispute, ExecutionQueueItem, ReputationEvent, SettlementEvent, Skill, Task, TaskResult } from "./types";

type DrizzleDb = DatabaseConnection["db"];

export type PostgresStore = DataStore;

const isSql = (condition: SQL | undefined): condition is SQL => condition !== undefined;

export const createPostgresStore = (db: DrizzleDb): PostgresStore => ({
  agents: new Map(),
  skills: new Map(),
  tasks: new Map(),
  taskResults: new Map(),
  reputationEvents: new Map(),
  settlementEvents: new Map(),
  deliveryManifests: new Map(),
  artifactChecks: new Map(),
  disputes: new Map(),
  executionQueue: new Map(),
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
  async listTasksByFilters(filters: TaskFilters) {
    const conditions = [
      filters.hirerAgentId === undefined ? undefined : eq(tasks.hirerAgentId, filters.hirerAgentId),
      filters.workerAgentId === undefined ? undefined : eq(tasks.workerAgentId, filters.workerAgentId),
      filters.status === undefined ? undefined : eq(tasks.status, filters.status),
      filters.parentTaskId === undefined ? undefined : filters.parentTaskId === null ? isNull(tasks.parentTaskId) : eq(tasks.parentTaskId, filters.parentTaskId),
      filters.deadlineFrom === undefined ? undefined : gte(tasks.deadline, new Date(filters.deadlineFrom)),
      filters.deadlineTo === undefined ? undefined : lte(tasks.deadline, new Date(filters.deadlineTo)),
    ].filter(isSql);
    return (await db.select().from(tasks).where(conditions.length > 0 ? and(...conditions) : undefined)).map(taskFromRow);
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
  async listReputationEventsByFilters(filters: EventFilters) {
    const conditions = [
      filters.taskId === undefined ? undefined : eq(reputationEvents.taskId, filters.taskId),
      filters.agentId === undefined ? undefined : eq(reputationEvents.agentId, filters.agentId),
    ].filter(isSql);
    return (await db.select().from(reputationEvents).where(conditions.length > 0 ? and(...conditions) : undefined)).map(reputationEventFromRow);
  },
  async saveSettlementEvent(settlementEvent: SettlementEvent) {
    await db.insert(settlementEvents).values(settlementEventToRow(settlementEvent)).onConflictDoNothing();
  },
  async listSettlementEvents() {
    return (await db.select().from(settlementEvents)).map(settlementEventFromRow);
  },
  async listSettlementEventsByFilters(filters: EventFilters) {
    const conditions = [
      filters.taskId === undefined ? undefined : eq(settlementEvents.taskId, filters.taskId),
    ].filter(isSql);
    return (await db.select().from(settlementEvents).where(conditions.length > 0 ? and(...conditions) : undefined)).map(settlementEventFromRow);
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
  async saveDeliveryManifest(manifest: DeliveryManifest) {
    await db.insert(deliveryManifests).values(deliveryManifestToRow(manifest)).onConflictDoUpdate({
      target: deliveryManifests.id,
      set: deliveryManifestToRow(manifest),
    });
  },
  async getDeliveryManifestByTaskResultId(taskResultId: string) {
    const [row] = await db.select().from(deliveryManifests).where(eq(deliveryManifests.taskResultId, taskResultId)).limit(1);
    return row ? deliveryManifestFromRow(row) : undefined;
  },
  async getDeliveryManifestByTaskId(taskId: string) {
    const [row] = await db.select().from(deliveryManifests).where(eq(deliveryManifests.taskId, taskId)).limit(1);
    return row ? deliveryManifestFromRow(row) : undefined;
  },
  async updateDeliveryManifest(manifest: DeliveryManifest) {
    await db.insert(deliveryManifests).values(deliveryManifestToRow(manifest)).onConflictDoUpdate({
      target: deliveryManifests.id,
      set: deliveryManifestToRow(manifest),
    });
  },
  async saveArtifactCheck(check: ArtifactCheck) {
    await db.insert(artifactChecks).values(artifactCheckToRow(check)).onConflictDoUpdate({
      target: artifactChecks.id,
      set: artifactCheckToRow(check),
    });
  },
  async listArtifactChecksByTaskId(taskId: string) {
    return (await db.select().from(artifactChecks).where(eq(artifactChecks.taskId, taskId))).map(artifactCheckFromRow);
  },
  async listArtifactChecksByTaskResultId(taskResultId: string) {
    return (await db.select().from(artifactChecks).where(eq(artifactChecks.taskResultId, taskResultId))).map(artifactCheckFromRow);
  },
  async updateArtifactCheck(check: ArtifactCheck) {
    await db.insert(artifactChecks).values(artifactCheckToRow(check)).onConflictDoUpdate({
      target: artifactChecks.id,
      set: artifactCheckToRow(check),
    });
  },
  async saveDispute(dispute: Dispute) {
    await db.insert(disputes).values(disputeToRow(dispute)).onConflictDoUpdate({
      target: disputes.id,
      set: disputeToRow(dispute),
    });
  },
  async getDispute(id: string) {
    const [row] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
    return row ? disputeFromRow(row) : undefined;
  },
  async listDisputes(filters: DisputeFilters) {
    const conditions = [
      filters.taskId === undefined ? undefined : eq(disputes.taskId, filters.taskId),
      filters.status === undefined ? undefined : eq(disputes.status, filters.status),
      filters.evaluatorAgentId === undefined ? undefined : eq(disputes.evaluatorAgentId, filters.evaluatorAgentId),
    ].filter(isSql);
    return (await db.select().from(disputes).where(conditions.length > 0 ? and(...conditions) : undefined)).map(disputeFromRow);
  },
  async updateDispute(dispute: Dispute) {
    await db.insert(disputes).values(disputeToRow(dispute)).onConflictDoUpdate({
      target: disputes.id,
      set: disputeToRow(dispute),
    });
  },
  async saveExecutionQueueItem(item: ExecutionQueueItem) {
    await db.insert(executionQueue).values(executionQueueItemToRow(item)).onConflictDoUpdate({
      target: executionQueue.id,
      set: executionQueueItemToRow(item),
    });
  },
  async getExecutionQueueItem(id: string) {
    const [row] = await db.select().from(executionQueue).where(eq(executionQueue.id, id)).limit(1);
    return row ? executionQueueItemFromRow(row) : undefined;
  },
  async getExecutionQueueItemByTaskId(taskId: string) {
    const [row] = await db.select().from(executionQueue).where(eq(executionQueue.taskId, taskId)).limit(1);
    return row ? executionQueueItemFromRow(row) : undefined;
  },
  async listExecutionQueueItems(filters: ExecutionQueueFilters) {
    const conditions = [
      filters.taskId === undefined ? undefined : eq(executionQueue.taskId, filters.taskId),
      filters.status === undefined ? undefined : eq(executionQueue.status, filters.status),
    ].filter(isSql);
    return (await db.select().from(executionQueue).where(conditions.length > 0 ? and(...conditions) : undefined)).map(executionQueueItemFromRow);
  },
  async updateExecutionQueueItem(item: ExecutionQueueItem) {
    await db.insert(executionQueue).values(executionQueueItemToRow(item)).onConflictDoUpdate({
      target: executionQueue.id,
      set: executionQueueItemToRow(item),
    });
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
  verifiedCompletionRate: agent.verifiedCompletionRate,
  onTimeDeliveryRate: agent.onTimeDeliveryRate,
  disputeRate: agent.disputeRate,
  unsafeArtifactRate: agent.unsafeArtifactRate,
  refundRate: agent.refundRate,
  totalTasksCompleted: agent.totalTasksCompleted,
  totalTasksFailed: agent.totalTasksFailed,
  totalDisputes: agent.totalDisputes,
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
  verifiedCompletionRate: row.verifiedCompletionRate,
  onTimeDeliveryRate: row.onTimeDeliveryRate,
  disputeRate: row.disputeRate,
  unsafeArtifactRate: row.unsafeArtifactRate,
  refundRate: row.refundRate,
  totalTasksCompleted: row.totalTasksCompleted,
  totalTasksFailed: row.totalTasksFailed,
  totalDisputes: row.totalDisputes,
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
  acceptanceSnapshotHash: task.acceptanceSnapshotHash,
  deliveryProtocolVersion: task.deliveryProtocolVersion,
  settlementMode: task.settlementMode,
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
  acceptanceSnapshotHash: row.acceptanceSnapshotHash,
  deliveryProtocolVersion: row.deliveryProtocolVersion,
  settlementMode: row.settlementMode,
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
  verificationStatus: event.verificationStatus,
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
  verificationStatus: row.verificationStatus,
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
  confirmationStatus: event.confirmationStatus,
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
  confirmationStatus: row.confirmationStatus,
  createdAt: toIso(row.createdAt),
});

const deliveryManifestToRow = (manifest: DeliveryManifest) => ({
  id: manifest.id,
  taskResultId: manifest.taskResultId,
  taskId: manifest.taskId,
  manifestVersion: manifest.manifestVersion,
  publicSafe: manifest.publicSafe,
  manifestPayload: manifest.manifestPayload,
  manifestHash: manifest.manifestHash,
  inputs: manifest.inputs,
  outputs: manifest.outputs,
  verifierStatus: manifest.verifierStatus,
  verifierCommand: manifest.verifierCommand,
  verifierExpectedOutput: manifest.verifierExpectedOutput,
  verifierExitCode: manifest.verifierExitCode,
  verifierStdout: manifest.verifierStdout,
  verifierStdoutHash: manifest.verifierStdoutHash,
  verifierRanAt: toDate(manifest.verifierRanAt),
  verificationTimeoutMs: manifest.verificationTimeoutMs,
  createdAt: new Date(manifest.createdAt),
});

const deliveryManifestFromRow = (row: typeof deliveryManifests.$inferSelect): DeliveryManifest => ({
  id: row.id,
  taskResultId: row.taskResultId,
  taskId: row.taskId,
  manifestVersion: row.manifestVersion,
  publicSafe: row.publicSafe,
  manifestPayload: jsonObject(row.manifestPayload),
  manifestHash: row.manifestHash,
  inputs: jsonArray(row.inputs),
  outputs: jsonArray(row.outputs),
  verifierStatus: row.verifierStatus as DeliveryManifest["verifierStatus"],
  verifierCommand: row.verifierCommand,
  verifierExpectedOutput: row.verifierExpectedOutput,
  verifierExitCode: row.verifierExitCode,
  verifierStdout: row.verifierStdout,
  verifierStdoutHash: row.verifierStdoutHash,
  verifierRanAt: row.verifierRanAt ? toIso(row.verifierRanAt) : null,
  verificationTimeoutMs: row.verificationTimeoutMs,
  createdAt: toIso(row.createdAt),
});

const artifactCheckToRow = (check: ArtifactCheck) => ({
  id: check.id,
  taskResultId: check.taskResultId,
  taskId: check.taskId,
  artifactUri: check.artifactUri,
  artifactHash: check.artifactHash,
  safetyStatus: check.safetyStatus,
  secretScanStatus: check.secretScanStatus,
  secretScanFindings: check.secretScanFindings,
  displayable: check.displayable,
  scannedAt: toDate(check.scannedAt),
  createdAt: new Date(check.createdAt),
});

const artifactCheckFromRow = (row: typeof artifactChecks.$inferSelect): ArtifactCheck => ({
  id: row.id,
  taskResultId: row.taskResultId,
  taskId: row.taskId,
  artifactUri: row.artifactUri,
  artifactHash: row.artifactHash,
  safetyStatus: row.safetyStatus,
  secretScanStatus: row.secretScanStatus,
  secretScanFindings: jsonArray(row.secretScanFindings),
  displayable: row.displayable,
  scannedAt: row.scannedAt ? toIso(row.scannedAt) : null,
  createdAt: toIso(row.createdAt),
});

const disputeToRow = (dispute: Dispute) => ({
  id: dispute.id,
  taskId: dispute.taskId,
  openedBy: dispute.openedBy,
  reason: dispute.reason,
  status: dispute.status,
  evaluatorAgentId: dispute.evaluatorAgentId,
  resolution: dispute.resolution,
  resolutionNotes: dispute.resolutionNotes,
  settlementAction: dispute.settlementAction,
  openedAt: new Date(dispute.openedAt),
  resolvedAt: toDate(dispute.resolvedAt),
});

const disputeFromRow = (row: typeof disputes.$inferSelect): Dispute => ({
  id: row.id,
  taskId: row.taskId,
  openedBy: row.openedBy,
  reason: row.reason,
  status: row.status as Dispute["status"],
  evaluatorAgentId: row.evaluatorAgentId,
  resolution: row.resolution as Dispute["resolution"],
  resolutionNotes: row.resolutionNotes,
  settlementAction: row.settlementAction,
  openedAt: toIso(row.openedAt),
  resolvedAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
});

const executionQueueItemToRow = (item: ExecutionQueueItem) => ({
  id: item.id,
  taskId: item.taskId,
  status: item.status,
  attempts: item.attempts,
  maxAttempts: item.maxAttempts,
  lastError: item.lastError,
  nextRetryAt: toDate(item.nextRetryAt),
  startedAt: toDate(item.startedAt),
  completedAt: toDate(item.completedAt),
  timeoutMs: item.timeoutMs,
  runtimeAdapter: item.runtimeAdapter,
  createdAt: new Date(item.createdAt),
});

const executionQueueItemFromRow = (row: typeof executionQueue.$inferSelect): ExecutionQueueItem => ({
  id: row.id,
  taskId: row.taskId,
  status: row.status as ExecutionQueueItem["status"],
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  lastError: row.lastError,
  nextRetryAt: row.nextRetryAt ? toIso(row.nextRetryAt) : null,
  startedAt: row.startedAt ? toIso(row.startedAt) : null,
  completedAt: row.completedAt ? toIso(row.completedAt) : null,
  timeoutMs: row.timeoutMs,
  runtimeAdapter: row.runtimeAdapter,
  createdAt: toIso(row.createdAt),
});
