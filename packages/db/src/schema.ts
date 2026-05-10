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
export const bidStatuses = ["submitted", "accepted", "rejected"] as const;
export const stakeEventTypes = ["staked", "unstaked"] as const;
export const skillCredentialRarities = ["uncommon", "rare", "epic", "legendary"] as const;
export const tokenTransferTypes = ["credit", "debit", "swap"] as const;

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

export const agentBids = pgTable(
  "agent_bids",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id),
    bidderAgentId: text("bidder_agent_id").notNull().references(() => agents.id),
    skillId: text("skill_id").notNull().references(() => skills.id),
    priceLamports: text("price_lamports").notNull(),
    message: text("message").notNull().default(""),
    status: text("status").notNull().default("submitted"),
    ...timestamps,
  },
  (table) => ({
    taskIdIdx: index("agent_bids_task_id_idx").on(table.taskId),
    bidderAgentIdIdx: index("agent_bids_bidder_agent_id_idx").on(table.bidderAgentId),
    statusIdx: index("agent_bids_status_idx").on(table.status),
  }),
);

export const stakeEvents = pgTable(
  "stake_events",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull().references(() => agents.id),
    wallet: text("wallet").notNull(),
    eventType: text("event_type").notNull(),
    amountLamports: text("amount_lamports").notNull(),
    resultingStakeLamports: text("resulting_stake_lamports").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("stake_events_agent_id_idx").on(table.agentId),
    walletIdx: index("stake_events_wallet_idx").on(table.wallet),
  }),
);

export const skillCredentials = pgTable(
  "skill_credentials",
  {
    id: text("id").primaryKey(),
    skillId: text("skill_id").notNull().references(() => skills.id),
    agentId: text("agent_id").notNull().references(() => agents.id),
    ownerWallet: text("owner_wallet").notNull(),
    name: text("name").notNull(),
    rarity: text("rarity").notNull(),
    metadata: jsonb("metadata").notNull(),
    mintedAt: timestamp("minted_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    skillIdIdx: index("skill_credentials_skill_id_idx").on(table.skillId),
    agentIdIdx: index("skill_credentials_agent_id_idx").on(table.agentId),
    ownerWalletIdx: index("skill_credentials_owner_wallet_idx").on(table.ownerWallet),
  }),
);

export const tokenAccounts = pgTable(
  "token_accounts",
  {
    id: text("id").primaryKey(),
    wallet: text("wallet").notNull(),
    symbol: text("symbol").notNull(),
    balanceLamports: text("balance_lamports").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    walletSymbolUniqueIdx: uniqueIndex("token_accounts_wallet_symbol_unique").on(table.wallet, table.symbol),
    walletIdx: index("token_accounts_wallet_idx").on(table.wallet),
  }),
);

export const tokenTransfers = pgTable(
  "token_transfers",
  {
    id: text("id").primaryKey(),
    wallet: text("wallet").notNull(),
    fromSymbol: text("from_symbol"),
    toSymbol: text("to_symbol").notNull(),
    amountLamports: text("amount_lamports").notNull(),
    receivedLamports: text("received_lamports").notNull(),
    transferType: text("transfer_type").notNull(),
    taskId: text("task_id").references(() => tasks.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    walletIdx: index("token_transfers_wallet_idx").on(table.wallet),
    taskIdIdx: index("token_transfers_task_id_idx").on(table.taskId),
  }),
);
