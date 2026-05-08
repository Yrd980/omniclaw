export type JsonObject = Record<string, unknown>;

export type AgentStatus = "active" | "paused" | "suspended";
export type TaskStatus =
  | "created"
  | "escrow_locked"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "completed"
  | "failed"
  | "expired"
  | "disputed"
  | "cancelled";
export type SettlementEventType =
  | "escrow_locked"
  | "worker_paid"
  | "hirer_refunded"
  | "platform_fee_paid"
  | "runtime_fee_paid"
  | "settlement_failed";

export type ActorHeaders = {
  wallet?: string;
  agentId?: string;
  role?: "admin" | "evaluator";
};

export type AgentDto = {
  agent_id: string;
  publisher_wallet: string;
  name: string;
  description: string;
  status: AgentStatus;
  reputation_score: number;
  success_rate: number;
  avg_latency_ms: number;
  quality_score: number;
  delegation_success_rate: number;
  historical_earnings_lamports: string;
  stake_amount: string;
  created_at: string;
  updated_at: string;
};

export type RegisterAgentInput = {
  publisher_wallet: string;
  name: string;
  description: string;
  status?: AgentStatus;
  reputation_score?: number;
  success_rate?: number;
  avg_latency_ms?: number;
  quality_score?: number;
  delegation_success_rate?: number;
  historical_earnings_lamports?: string;
  stake_amount?: string;
};

export type SkillDto = {
  skill_id: string;
  agent_id: string;
  name: string;
  description: string;
  input_schema: JsonObject;
  output_schema: JsonObject;
  base_price_lamports: string;
  estimated_latency_ms: number;
  required_permissions: string[];
  created_at: string;
  updated_at: string;
};

export type RegisterSkillInput = {
  name: string;
  description: string;
  input_schema?: JsonObject;
  output_schema?: JsonObject;
  base_price_lamports: string;
  estimated_latency_ms: number;
  required_permissions?: string[];
};

export type TaskDto = {
  task_id: string;
  parent_task_id: string | null;
  hirer_agent_id: string;
  worker_agent_id: string;
  skill_id: string;
  task_payload: JsonObject;
  payment_lamports: string;
  platform_fee_lamports: string;
  runtime_fee_lamports: string;
  worker_payout_lamports: string;
  deadline: string;
  status: TaskStatus;
  escrow_account: string | null;
  escrow_tx_signature: string | null;
  settlement_tx_signature: string | null;
  accepted_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
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

export type ListTasksFilters = {
  hirer_agent_id?: string;
  worker_agent_id?: string;
  status?: TaskStatus;
  parent_task_id?: string | null;
  deadline_from?: string;
  deadline_to?: string;
};

export type TaskResultDto = {
  result_id: string;
  task_id: string;
  worker_agent_id: string;
  result_payload: JsonObject;
  artifacts: unknown[];
  quality_score: number | null;
  submitted_at: string;
};

export type SubmitResultInput = {
  result_payload: JsonObject;
  artifacts?: unknown[];
};

export type ResolveTaskInput = {
  resolution: "completed" | "failed" | "disputed";
  quality_score?: number;
  review_score?: number;
};

export type ReputationEventDto = {
  event_id: string;
  agent_id: string;
  task_id: string;
  success: boolean;
  latency_ms: number;
  quality_score: number | null;
  review_score: number | null;
  delegation_success: boolean;
  reputation_delta: number;
  reason: string | null;
  created_at: string;
};

export type SettlementEventDto = {
  event_id: string;
  task_id: string;
  event_type: SettlementEventType;
  amount_lamports: string;
  from_wallet: string | null;
  to_wallet: string | null;
  tx_signature: string;
  failure_reason: string | null;
  created_at: string;
};

export type DiscoverAgentsFilters = {
  capability?: string;
  reputation_gt?: number | string;
  latency_lt_ms?: number | string;
  max_price_lamports?: string;
  status?: AgentStatus;
};

export type DiscoveryResultDto = {
  agent: AgentDto;
  skill: SkillDto;
  ranking: {
    score: number;
    skillMatch: number;
    reputation: number;
    successRate: number;
    quality: number;
    latency: number;
    price: number;
    stake: number;
  };
};

export type TaskDetailDto = {
  task: TaskDto;
  result: TaskResultDto | null;
  settlement_events: SettlementEventDto[];
  reputation_events: ReputationEventDto[];
};

export type TaskGraphDto = {
  rootTaskId: string;
  nodes: Array<{
    taskId: string;
    parentTaskId: string | null;
    workerAgentId: string;
    status: TaskStatus;
    paymentLamports: string;
    workerPayoutLamports: string;
    deadline: string;
  }>;
  edges: Array<{ from: string; to: string }>;
};

export type EventFilters = {
  task_id?: string;
  agent_id?: string;
};

export type OmniClawApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details: unknown;
    path: string;
  };
};
