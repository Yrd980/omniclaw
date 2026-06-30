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

export const manifestVerifierStatuses = ["pending", "passed", "failed", "timeout", "error"] as const;
export const disputeStatuses = ["opened", "under_review", "resolved", "escalated", "dismissed"] as const;
export const disputeResolutions = ["worker_favored", "hirer_favored", "split", "dismissed"] as const;
export const executionStatuses = ["queued", "running", "completed", "failed", "cancelled", "timed_out"] as const;

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
    verifiedCompletionRate: doublePrecision("verified_completion_rate").notNull().default(0),
    onTimeDeliveryRate: doublePrecision("on_time_delivery_rate").notNull().default(0),
    disputeRate: doublePrecision("dispute_rate").notNull().default(0),
    unsafeArtifactRate: doublePrecision("unsafe_artifact_rate").notNull().default(0),
    refundRate: doublePrecision("refund_rate").notNull().default(0),
    totalTasksCompleted: integer("total_tasks_completed").notNull().default(0),
    totalTasksFailed: integer("total_tasks_failed").notNull().default(0),
    totalDisputes: integer("total_disputes").notNull().default(0),
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
    acceptanceSnapshotHash: text("acceptance_snapshot_hash"),
    deliveryProtocolVersion: text("delivery_protocol_version").notNull().default("omniclaw.delivery.v1"),
    settlementMode: text("settlement_mode").notNull().default("demo_mock"),
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
    qualityScore: integer("quality_score"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    taskIdIdx: index("task_results_task_id_idx").on(table.taskId),
    workerAgentIdIdx: index("task_results_worker_agent_id_idx").on(table.workerAgentId),
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
    verificationStatus: text("verification_status"),
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
    confirmationStatus: text("confirmation_status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdIdx: index("settlement_events_task_id_idx").on(table.taskId),
    eventTypeIdx: index("settlement_events_event_type_idx").on(table.eventType),
  }),
);

export const deliveryManifests = pgTable(
  "delivery_manifests",
  {
    id: text("id").primaryKey(),
    taskResultId: text("task_result_id").notNull().references(() => taskResults.id),
    taskId: text("task_id").notNull().references(() => tasks.id),
    manifestVersion: text("manifest_version").notNull().default("omniclaw.delivery.v1"),
    publicSafe: boolean("public_safe").notNull().default(false),
    manifestPayload: jsonb("manifest_payload").notNull(),
    manifestHash: text("manifest_hash"),
    inputs: jsonb("inputs").notNull().default([]),
    outputs: jsonb("outputs").notNull().default([]),
    verifierStatus: text("verifier_status").notNull().default("pending"),
    verifierCommand: text("verifier_command"),
    verifierExpectedOutput: text("verifier_expected_output"),
    verifierExitCode: integer("verifier_exit_code"),
    verifierStdout: text("verifier_stdout"),
    verifierStdoutHash: text("verifier_stdout_hash"),
    verifierRanAt: timestamp("verifier_ran_at", { withTimezone: true }),
    verificationTimeoutMs: integer("verification_timeout_ms").notNull().default(30000),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskResultIdIdx: index("delivery_manifests_task_result_id_idx").on(table.taskResultId),
    taskIdIdx: index("delivery_manifests_task_id_idx").on(table.taskId),
    verifierStatusIdx: index("delivery_manifests_verifier_status_idx").on(table.verifierStatus),
  }),
);

export const artifactChecks = pgTable(
  "artifact_checks",
  {
    id: text("id").primaryKey(),
    taskResultId: text("task_result_id").notNull().references(() => taskResults.id),
    taskId: text("task_id").notNull().references(() => tasks.id),
    artifactUri: text("artifact_uri").notNull(),
    artifactHash: text("artifact_hash"),
    safetyStatus: text("safety_status").notNull().default("unvalidated"),
    secretScanStatus: text("secret_scan_status").notNull().default("pending"),
    secretScanFindings: jsonb("secret_scan_findings").notNull().default([]),
    displayable: boolean("displayable").notNull().default(false),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskResultIdIdx: index("artifact_checks_task_result_id_idx").on(table.taskResultId),
    taskIdIdx: index("artifact_checks_task_id_idx").on(table.taskId),
    safetyStatusIdx: index("artifact_checks_safety_status_idx").on(table.safetyStatus),
  }),
);

export const disputes = pgTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id),
    openedBy: text("opened_by").notNull().references(() => agents.id),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("opened"),
    evaluatorAgentId: text("evaluator_agent_id").references(() => agents.id),
    resolution: text("resolution"),
    resolutionNotes: text("resolution_notes"),
    settlementAction: text("settlement_action"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    taskIdIdx: index("disputes_task_id_idx").on(table.taskId),
    openedByIdx: index("disputes_opened_by_idx").on(table.openedBy),
    statusIdx: index("disputes_status_idx").on(table.status),
  }),
);

export const executionQueue = pgTable(
  "execution_queue",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    timeoutMs: integer("timeout_ms").notNull().default(300000),
    runtimeAdapter: text("runtime_adapter"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdIdx: index("execution_queue_task_id_idx").on(table.taskId),
    statusIdx: index("execution_queue_status_idx").on(table.status),
    nextRetryAtIdx: index("execution_queue_next_retry_at_idx").on(table.nextRetryAt),
  }),
);
