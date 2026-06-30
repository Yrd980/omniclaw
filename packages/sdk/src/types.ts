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
export type ManifestVerifierStatus = "pending" | "passed" | "failed" | "timeout" | "error";
export type DisputeStatus = "opened" | "under_review" | "resolved" | "escalated" | "dismissed";
export type DisputeResolution = "worker_favored" | "hirer_favored" | "split" | "dismissed";
export type ExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
export type SafetyStatus = "validated" | "unsafe" | "private_runtime" | "unvalidated" | "flagged";
export type SecretScanStatus = "pending" | "clean" | "findings" | "error";

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
  settlement_state: "locked" | "released" | "refunded" | "disputed" | "failed" | "unfunded";
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
  quality_score: number | null;
  submitted_at: string;
};

export type SubmitResultInput = {
  result_payload: JsonObject;
  artifacts?: ArtifactReferenceInput[];
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

export type ManifestInput = {
  name: string;
  kind: string;
  uri?: string;
  hash?: string;
  checksum?: string;
  safety_label?: string;
};

export type VerifierConfig = {
  kind: "script" | "none" | "manual";
  entrypoint?: string;
  smoke_command?: string;
  expected_output?: string;
  timeout_ms?: number;
};

export type DeliveryManifestDto = {
  manifest_id: string;
  task_result_id: string;
  task_id: string;
  manifest_version: string;
  public_safe: boolean;
  manifest_payload: JsonObject;
  manifest_hash: string | null;
  inputs: ManifestInput[];
  outputs: ManifestInput[];
  verifier_status: ManifestVerifierStatus;
  verifier_command: string | null;
  verifier_expected_output: string | null;
  verifier_exit_code: number | null;
  verifier_stdout: string | null;
  verifier_stdout_hash: string | null;
  verifier_ran_at: string | null;
  verification_timeout_ms: number;
  created_at: string;
};

export type SubmitManifestInput = {
  manifest_payload: JsonObject;
  public_safe?: boolean;
  inputs?: ManifestInput[];
  outputs?: ManifestInput[];
  verifier?: VerifierConfig;
  verification_timeout_ms?: number;
};

export type ArtifactCheckDto = {
  check_id: string;
  task_result_id: string;
  task_id: string;
  artifact_uri: string;
  artifact_hash: string | null;
  safety_status: SafetyStatus;
  secret_scan_status: SecretScanStatus;
  secret_scan_findings: unknown[];
  displayable: boolean;
  scanned_at: string | null;
  created_at: string;
};

export type DisputeDto = {
  dispute_id: string;
  task_id: string;
  opened_by: string;
  reason: string;
  status: DisputeStatus;
  evaluator_agent_id: string | null;
  resolution: DisputeResolution | null;
  resolution_notes: string | null;
  settlement_action: string | null;
  opened_at: string;
  resolved_at: string | null;
};

export type OpenDisputeInput = {
  reason: string;
};

export type ResolveDisputeInput = {
  resolution: DisputeResolution;
  resolution_notes?: string;
  settlement_action?: "release_payout" | "refund" | "split";
  quality_score?: number;
  review_score?: number;
};

export type OperatorSettlementFailureDto = {
  task_id: string;
  event_id: string;
  event_type: SettlementEventType;
  amount_lamports: string;
  failure_reason: string | null;
  tx_signature: string;
  created_at: string;
};

export type OperatorAgentSuspensionDto = {
  agent_id: string;
  name: string;
  status: AgentStatus;
  unsafe_artifact_rate: number;
  dispute_rate: number;
  total_disputes: number;
  total_tasks_completed: number;
};

export type ExecutionQueueItemDto = {
  execution_id: string;
  task_id: string;
  status: ExecutionStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  timeout_ms: number;
  runtime_adapter: string | null;
  created_at: string;
};

export type NonceDto = {
  nonce: string;
  message: string;
  expires_at: string;
};

export type SiwsVerifyInput = {
  message: string;
  signature: string;
  address: string;
};

export type SiwsVerifyDto = {
  valid: boolean;
  address: string;
  agent_id: string | null;
  role: "admin" | "evaluator" | null;
};

export type TaskProofFullDto = {
  task_id: string;
  environment: string;
  delivery_manifest: DeliveryManifestDto | null;
  escrow: {
    locked: boolean;
    escrow_account: string | null;
    tx_signature: string | null;
  };
  artifacts: {
    count: number;
    validated_count: number;
    unsafe_count: number;
    private_runtime_count: number;
    references: ArtifactReferenceDto[];
    checks: ArtifactCheckDto[];
  };
  verifier: {
    status: ManifestVerifierStatus | null;
    command: string | null;
    expected_output: string | null;
    exit_code: number | null;
    ran_at: string | null;
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
    verification_status: string | null;
  };
  disputes: DisputeDto[];
};

export type TaskDetailFullDto = {
  task: TaskDto;
  task_contract: TaskContractDto;
  proof: TaskProofFullDto;
  delivery_manifest: DeliveryManifestDto | null;
  result: TaskResultDto | null;
  settlement_events: SettlementEventDto[];
  reputation_events: ReputationEventDto[];
  disputes: DisputeDto[];
  artifact_checks: ArtifactCheckDto[];
};
