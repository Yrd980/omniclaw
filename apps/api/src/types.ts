import type { agentStatuses, disputeResolutions, disputeStatuses, executionStatuses, manifestVerifierStatuses, settlementEventTypes, taskStatuses } from "@omniclaw/db";

export type AgentStatus = (typeof agentStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type SettlementEventType = (typeof settlementEventTypes)[number];
export type ManifestVerifierStatus = (typeof manifestVerifierStatuses)[number];
export type DisputeStatus = (typeof disputeStatuses)[number];
export type DisputeResolution = (typeof disputeResolutions)[number];
export type ExecutionStatus = (typeof executionStatuses)[number];

export type JsonObject = Record<string, unknown>;

export type Agent = {
  id: string;
  publisherWallet: string;
  name: string;
  description: string;
  status: AgentStatus;
  reputationScore: number;
  successRate: number;
  avgLatencyMs: number;
  qualityScore: number;
  delegationSuccessRate: number;
  historicalEarningsLamports: string;
  stakeAmount: string;
  verifiedCompletionRate: number;
  onTimeDeliveryRate: number;
  disputeRate: number;
  unsafeArtifactRate: number;
  refundRate: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  totalDisputes: number;
  createdAt: string;
  updatedAt: string;
};

export type Skill = {
  id: string;
  agentId: string;
  name: string;
  description: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  basePriceLamports: string;
  estimatedLatencyMs: number;
  requiredPermissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  parentTaskId: string | null;
  hirerAgentId: string;
  workerAgentId: string;
  skillId: string;
  taskPayload: JsonObject;
  paymentLamports: string;
  platformFeeLamports: string;
  runtimeFeeLamports: string;
  workerPayoutLamports: string;
  deadline: string;
  status: TaskStatus;
  escrowAccount: string | null;
  escrowTxSignature: string | null;
  settlementTxSignature: string | null;
  acceptedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  acceptanceSnapshotHash: string | null;
  deliveryProtocolVersion: string;
  settlementMode: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskResult = {
  id: string;
  taskId: string;
  workerAgentId: string;
  resultPayload: JsonObject;
  artifacts: unknown[];
  qualityScore: number | null;
  submittedAt: string;
};

export type ReputationEvent = {
  id: string;
  agentId: string;
  taskId: string;
  success: boolean;
  latencyMs: number;
  qualityScore: number | null;
  reviewScore: number | null;
  delegationSuccess: boolean;
  reputationDelta: number;
  verificationStatus: string | null;
  reason: string | null;
  createdAt: string;
};

export type SettlementEvent = {
  id: string;
  taskId: string;
  eventType: SettlementEventType;
  amountLamports: string;
  fromWallet: string | null;
  toWallet: string | null;
  txSignature: string;
  failureReason: string | null;
  confirmationStatus: string;
  createdAt: string;
};

export type DeliveryManifest = {
  id: string;
  taskResultId: string;
  taskId: string;
  manifestVersion: string;
  publicSafe: boolean;
  manifestPayload: JsonObject;
  manifestHash: string | null;
  inputs: ManifestInput[];
  outputs: ManifestInput[];
  verifierStatus: ManifestVerifierStatus;
  verifierCommand: string | null;
  verifierExpectedOutput: string | null;
  verifierExitCode: number | null;
  verifierStdout: string | null;
  verifierStdoutHash: string | null;
  verifierRanAt: string | null;
  verificationTimeoutMs: number;
  createdAt: string;
};

export type ManifestInput = {
  name: string;
  kind: string;
  uri?: string;
  hash?: string;
  checksum?: string;
  safety_label?: string;
};

export type ArtifactCheck = {
  id: string;
  taskResultId: string;
  taskId: string;
  artifactUri: string;
  artifactHash: string | null;
  safetyStatus: string;
  secretScanStatus: string;
  secretScanFindings: unknown[];
  displayable: boolean;
  scannedAt: string | null;
  createdAt: string;
};

export type Dispute = {
  id: string;
  taskId: string;
  openedBy: string;
  reason: string;
  status: DisputeStatus;
  evaluatorAgentId: string | null;
  resolution: DisputeResolution | null;
  resolutionNotes: string | null;
  settlementAction: string | null;
  openedAt: string;
  resolvedAt: string | null;
};

export type ExecutionQueueItem = {
  id: string;
  taskId: string;
  status: ExecutionStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  timeoutMs: number;
  runtimeAdapter: string | null;
  createdAt: string;
};

export type Actor = {
  agentId?: string;
  wallet?: string;
  role?: "admin" | "evaluator";
};
