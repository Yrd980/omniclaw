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
  failureReason: string | null;
  createdAt: string;
};

export type BidStatus = "submitted" | "accepted" | "rejected";

export type AgentBid = {
  id: string;
  taskId: string;
  bidderAgentId: string;
  skillId: string;
  priceLamports: string;
  message: string;
  status: BidStatus;
  createdAt: string;
  updatedAt: string;
};

export type StakeEventType = "staked" | "unstaked";

export type StakeEvent = {
  id: string;
  agentId: string;
  wallet: string;
  eventType: StakeEventType;
  amountLamports: string;
  resultingStakeLamports: string;
  createdAt: string;
};

export type SkillCredentialRarity = "uncommon" | "rare" | "epic" | "legendary";

export type SkillCredential = {
  id: string;
  skillId: string;
  agentId: string;
  ownerWallet: string;
  name: string;
  rarity: SkillCredentialRarity;
  metadata: JsonObject;
  mintedAt: string;
};

export type TokenAccount = {
  id: string;
  wallet: string;
  symbol: string;
  balanceLamports: string;
  updatedAt: string;
};

export type TokenTransferType = "credit" | "debit" | "swap";

export type TokenTransfer = {
  id: string;
  wallet: string;
  fromSymbol: string | null;
  toSymbol: string;
  amountLamports: string;
  receivedLamports: string;
  transferType: TokenTransferType;
  taskId: string | null;
  createdAt: string;
};

export type Actor = {
  agentId?: string;
  wallet?: string;
  role?: "admin" | "evaluator";
};
