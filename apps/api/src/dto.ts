import type { Agent, ReputationEvent, SettlementEvent, Skill, Task, TaskResult } from "./types";
import { normalizeArtifactReferences } from "./task-contracts";

export const agentDto = (agent: Agent) => ({
  agent_id: agent.id,
  publisher_wallet: agent.publisherWallet,
  name: agent.name,
  description: agent.description,
  status: agent.status,
  reputation_score: agent.reputationScore,
  success_rate: agent.successRate,
  avg_latency_ms: agent.avgLatencyMs,
  quality_score: agent.qualityScore,
  delegation_success_rate: agent.delegationSuccessRate,
  historical_earnings_lamports: agent.historicalEarningsLamports,
  stake_amount: agent.stakeAmount,
  created_at: agent.createdAt,
  updated_at: agent.updatedAt,
});

export const skillDto = (skill: Skill) => ({
  skill_id: skill.id,
  agent_id: skill.agentId,
  name: skill.name,
  description: skill.description,
  input_schema: skill.inputSchema,
  output_schema: skill.outputSchema,
  base_price_lamports: skill.basePriceLamports,
  estimated_latency_ms: skill.estimatedLatencyMs,
  required_permissions: skill.requiredPermissions,
  created_at: skill.createdAt,
  updated_at: skill.updatedAt,
});

export const taskDto = (task: Task) => ({
  task_id: task.id,
  parent_task_id: task.parentTaskId,
  hirer_agent_id: task.hirerAgentId,
  worker_agent_id: task.workerAgentId,
  skill_id: task.skillId,
  task_payload: task.taskPayload,
  payment_lamports: task.paymentLamports,
  platform_fee_lamports: task.platformFeeLamports,
  runtime_fee_lamports: task.runtimeFeeLamports,
  worker_payout_lamports: task.workerPayoutLamports,
  deadline: task.deadline,
  status: task.status,
  escrow_account: task.escrowAccount,
  escrow_tx_signature: task.escrowTxSignature,
  settlement_tx_signature: task.settlementTxSignature,
  accepted_at: task.acceptedAt,
  submitted_at: task.submittedAt,
  completed_at: task.completedAt,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
});

export const taskResultDto = (result: TaskResult) => ({
  result_id: result.id,
  task_id: result.taskId,
  worker_agent_id: result.workerAgentId,
  result_payload: result.resultPayload,
  artifacts: result.artifacts,
  artifact_references: normalizeArtifactReferences(result.artifacts),
  quality_score: result.qualityScore,
  submitted_at: result.submittedAt,
});

export const reputationEventDto = (event: ReputationEvent) => ({
  event_id: event.id,
  agent_id: event.agentId,
  task_id: event.taskId,
  success: event.success,
  latency_ms: event.latencyMs,
  quality_score: event.qualityScore,
  review_score: event.reviewScore,
  delegation_success: event.delegationSuccess,
  reputation_delta: event.reputationDelta,
  reason: event.reason,
  created_at: event.createdAt,
});

export const settlementEventDto = (event: SettlementEvent) => ({
  event_id: event.id,
  task_id: event.taskId,
  event_type: event.eventType,
  amount_lamports: event.amountLamports,
  from_wallet: event.fromWallet,
  to_wallet: event.toWallet,
  tx_signature: event.txSignature,
  failure_reason: event.failureReason,
  created_at: event.createdAt,
});
