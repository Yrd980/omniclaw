import type { agentStatuses, settlementEventTypes, taskStatuses } from "@omniclaw/db";

export type AgentStatus = (typeof agentStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type SettlementEventType = (typeof settlementEventTypes)[number];

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
  createdAt: string;
};

export type Actor = {
  agentId?: string;
  wallet?: string;
  role?: "admin" | "evaluator";
};
