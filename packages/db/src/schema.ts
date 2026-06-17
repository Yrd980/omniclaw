import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";

export const embeddingDimensions = 1536;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const agentStatuses = ["active", "paused", "suspended"] as const;
export const taskStatuses = [
  "created",
  "escrow_locked",
  "accepted",
  "in_progress",
  "submitted",
  "completed",
  "failed",
  "expired",
  "disputed",
  "cancelled",
] as const;
export const settlementEventTypes = [
  "escrow_locked",
  "worker_paid",
  "hirer_refunded",
  "platform_fee_paid",
  "runtime_fee_paid",
  "settlement_failed",
] as const;

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    publisherWallet: text("publisher_wallet").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("active"),
    reputationScore: integer("reputation_score").notNull().default(0),
    successRate: doublePrecision("success_rate").notNull().default(0),
    avgLatencyMs: integer("avg_latency_ms").notNull().default(0),
    qualityScore: integer("quality_score").notNull().default(0),
    delegationSuccessRate: doublePrecision("delegation_success_rate").notNull().default(0),
    historicalEarningsLamports: text("historical_earnings_lamports").notNull().default("0"),
    stakeAmount: text("stake_amount").notNull().default("0"),
    profileEmbedding: vector("profile_embedding", { dimensions: embeddingDimensions }),
    ...timestamps,
  },
  (table) => ({
    publisherWalletIdx: index("agents_publisher_wallet_idx").on(table.publisherWallet),
    statusIdx: index("agents_status_idx").on(table.status),
    reputationScoreIdx: index("agents_reputation_score_idx").on(table.reputationScore),
  }),
);

export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull().references(() => agents.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema").notNull(),
    outputSchema: jsonb("output_schema").notNull(),
    basePriceLamports: text("base_price_lamports").notNull(),
    estimatedLatencyMs: integer("estimated_latency_ms").notNull(),
    requiredPermissions: jsonb("required_permissions").notNull(),
    descriptionEmbedding: vector("description_embedding", { dimensions: embeddingDimensions }),
    ...timestamps,
  },
  (table) => ({
    agentIdIdx: index("skills_agent_id_idx").on(table.agentId),
    agentNameUniqueIdx: uniqueIndex("skills_agent_name_unique").on(table.agentId, table.name),
    nameIdx: index("skills_name_idx").on(table.name),
    basePriceIdx: index("skills_base_price_lamports_idx").on(table.basePriceLamports),
    latencyIdx: index("skills_estimated_latency_ms_idx").on(table.estimatedLatencyMs),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    parentTaskId: text("parent_task_id").references((): AnyPgColumn => tasks.id),
    hirerAgentId: text("hirer_agent_id").notNull().references(() => agents.id),
    workerAgentId: text("worker_agent_id").notNull().references(() => agents.id),
    skillId: text("skill_id").notNull().references(() => skills.id),
    taskPayload: jsonb("task_payload").notNull(),
    paymentLamports: text("payment_lamports").notNull(),
    platformFeeLamports: text("platform_fee_lamports").notNull(),
    runtimeFeeLamports: text("runtime_fee_lamports").notNull(),
    workerPayoutLamports: text("worker_payout_lamports").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    escrowAccount: text("escrow_account"),
    escrowTxSignature: text("escrow_tx_signature"),
    settlementTxSignature: text("settlement_tx_signature"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    parentTaskIdIdx: index("tasks_parent_task_id_idx").on(table.parentTaskId),
    hirerAgentIdIdx: index("tasks_hirer_agent_id_idx").on(table.hirerAgentId),
    workerAgentIdIdx: index("tasks_worker_agent_id_idx").on(table.workerAgentId),
    skillIdIdx: index("tasks_skill_id_idx").on(table.skillId),
    statusIdx: index("tasks_status_idx").on(table.status),
    deadlineIdx: index("tasks_deadline_idx").on(table.deadline),
  }),
);

export const taskResults = pgTable(
  "task_results",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id),
    workerAgentId: text("worker_agent_id").notNull().references(() => agents.id),
    resultPayload: jsonb("result_payload").notNull(),
    artifacts: jsonb("artifacts").notNull(),
    deliveryManifestId: text("delivery_manifest_id"),
    qualityScore: integer("quality_score"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    taskIdIdx: index("task_results_task_id_idx").on(table.taskId),
    workerAgentIdIdx: index("task_results_worker_agent_id_idx").on(table.workerAgentId),
  }),
);

export const deliveryManifests = pgTable(
  "delivery_manifests",
  {
    id: text("id").primaryKey(),
    taskResultId: text("task_result_id").notNull().references(() => taskResults.id),
    taskId: text("task_id").notNull().references(() => tasks.id),
    manifestVersion: text("manifest_version").notNull(),
    publicSafe: boolean("public_safe").notNull(),
    manifestPayload: jsonb("manifest_payload").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    verifierStatus: text("verifier_status").notNull(),
    verifierCommand: text("verifier_command"),
    verifierExpectedOutput: text("verifier_expected_output"),
    verifierExitCode: integer("verifier_exit_code"),
    verifierStdoutHash: text("verifier_stdout_hash"),
    publicSafetyStatus: text("public_safety_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskResultIdIdx: index("delivery_manifests_task_result_id_idx").on(table.taskResultId),
    taskIdIdx: index("delivery_manifests_task_id_idx").on(table.taskId),
    manifestHashIdx: index("delivery_manifests_manifest_hash_idx").on(table.manifestHash),
    verifierStatusIdx: index("delivery_manifests_verifier_status_idx").on(table.verifierStatus),
  }),
);

export const reputationEvents = pgTable(
  "reputation_events",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull().references(() => agents.id),
    taskId: text("task_id").notNull().references(() => tasks.id),
    success: boolean("success").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    qualityScore: integer("quality_score"),
    reviewScore: integer("review_score"),
    delegationSuccess: boolean("delegation_success").notNull().default(false),
    reputationDelta: integer("reputation_delta").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("reputation_events_agent_id_idx").on(table.agentId),
    taskIdIdx: index("reputation_events_task_id_idx").on(table.taskId),
    createdAtIdx: index("reputation_events_created_at_idx").on(table.createdAt),
  }),
);

export const settlementEvents = pgTable(
  "settlement_events",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id),
    eventType: text("event_type").notNull(),
    amountLamports: text("amount_lamports").notNull(),
    fromWallet: text("from_wallet"),
    toWallet: text("to_wallet"),
    txSignature: text("tx_signature").notNull(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdIdx: index("settlement_events_task_id_idx").on(table.taskId),
    eventTypeIdx: index("settlement_events_event_type_idx").on(table.eventType),
  }),
);
