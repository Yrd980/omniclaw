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

export type HealthDto = {
  ok: boolean;
  environment: "local" | "demo" | "testnet" | "production";
  store: "memory" | "postgres";
  runtime_adapter: "mock" | "grpc";
  settlement_adapter: "mock" | "solana_testnet";
  auth_mode: "headers" | "signed";
  production_ready: boolean;
  warnings: string[];
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

export type TaskContractDto = {
  task_pack: string;
  project_context: JsonObject;
  research_questions: string[];
  acceptance_criteria: string[];
  permission_scope: string[];
  delegation_budget_lamports: string | null;
  privacy_level: string;
  review_window_hours: number;
  settlement_mode: string;
  settlement_rules: {
    escrow_required: true;
    worker_starts_after_escrow: true;
    approval: string;
    rejection: string;
    dispute_resolution: string;
    timeout: string;
  };
  frozen_at: string;
};

export type TaskProofDto = {
  environment: string;
  escrow: {
    locked: boolean;
    escrow_account: string | null;
    tx_signature: string | null;
    locked_at: string | null;
  };
  execution: {
    status: TaskStatus;
    accepted_at: string | null;
    submitted_at: string | null;
    completed_at: string | null;
  };
  artifacts: {
    count: number;
    validated_count: number;
    unsafe_count: number;
    private_runtime_count: number;
    references: ArtifactReferenceDto[];
  };
  delivery_manifest: {
    present: boolean;
    manifest_id: string | null;
    manifest_version: string | null;
    manifest_hash: string | null;
    public_safe: boolean | null;
    public_safety_status: PublicSafetyStatus | null;
  };
  verifier: {
    configured: boolean;
    status: VerifierStatus | "not_submitted";
    command: string | null;
    expected_output: string | null;
    exit_code: number | null;
    stdout_hash: string | null;
  };
  settlement: {
    released: boolean;
    refunded: boolean;
    disputed: boolean;
    tx_signature: string | null;
  };
  reputation: {
    events: number;
    worker_delta: number;
  };
};

export type ArtifactValidationStatus = "validated" | "missing_hash" | "unsafe" | "private_runtime" | "unvalidated";
export type VerifierStatus = "not_configured" | "pending" | "passed" | "failed";
export type PublicSafetyStatus = "public_safe" | "unsafe" | "private" | "inconsistent";

export type ArtifactReferenceDto = {
  kind: string;
  task_id: string | null;
  uri: string | null;
  hash: string | null;
  checksum: string | null;
  safety_label: string | null;
  validation_status: ArtifactValidationStatus;
  displayable: boolean;
};

export type ArtifactReferenceInput = {
  kind?: string;
  task_id?: string;
  uri?: string;
  hash?: string;
  checksum?: string;
  safety_label?: string;
  private_runtime?: boolean;
  tags?: string[];
  [key: string]: unknown;
};

export type TaskProofSummaryDto = {
  escrow_locked: boolean;
  artifact_count: number;
  validated_artifact_count: number;
  delivery_manifest_present: boolean;
  public_safety_status: PublicSafetyStatus | null;
  verifier_status: VerifierStatus | null;
  settlement_state: "locked" | "released" | "refunded" | "disputed" | "failed" | "unfunded";
};

export type DeliveryManifestInput = {
  manifest_version: "omniclaw.delivery.v1";
  task_id: string;
  source_agent_id: string;
  task_pack?: string;
  public_safe: boolean;
  inputs: Array<{
    name: string;
    kind: string;
    hash: string;
  }>;
  outputs: Array<{
    name: string;
    kind: string;
    uri: string;
    hash: string;
    safety_label: string;
  }>;
  verifier?: {
    kind: string;
    entrypoint: string;
    smoke_command?: string;
    expected_output: string;
  } | null;
  acceptance: {
    criteria: string[];
    review_window_hours?: number;
  };
};

export type DeliveryManifestDto = {
  manifest_id: string;
  task_result_id: string;
  task_id: string;
  manifest_version: "omniclaw.delivery.v1";
  public_safe: boolean;
  manifest_payload: JsonObject;
  manifest_hash: string;
  verifier_status: VerifierStatus;
  verifier_command: string | null;
  verifier_expected_output: string | null;
  verifier_exit_code: number | null;
  verifier_stdout_hash: string | null;
  public_safety_status: PublicSafetyStatus;
  created_at: string;
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
  artifact_references: ArtifactReferenceDto[];
  delivery_manifest_id: string | null;
  delivery_manifest: DeliveryManifestDto | null;
  quality_score: number | null;
  submitted_at: string;
};

export type SubmitResultInput = {
  result_payload: JsonObject;
  artifacts?: ArtifactReferenceInput[];
  delivery_manifest?: DeliveryManifestInput;
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
  task_contract: TaskContractDto;
  proof: TaskProofDto;
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
    skillId: string;
    status: TaskStatus;
    paymentLamports: string;
    workerPayoutLamports: string;
    deadline: string;
    taskPack: string;
    privacyLevel: string;
    proof: TaskProofSummaryDto;
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
