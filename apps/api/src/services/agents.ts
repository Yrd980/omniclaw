import { invariant } from "../errors";
import type { DataStore } from "../store";
import type { Actor, Agent, AgentStatus, JsonObject, Skill } from "../types";
import { isJsonSchemaObject } from "../validation";
import { requirePublisher } from "./authorization";

type RegisterAgentInput = {
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

type RegisterSkillInput = {
  name: string;
  description: string;
  input_schema?: JsonObject;
  output_schema?: JsonObject;
  base_price_lamports: string;
  estimated_latency_ms: number;
  required_permissions?: string[];
};

export const registerAgent = async (store: DataStore, actor: Actor, input: RegisterAgentInput): Promise<Agent> => {
  invariant(input.publisher_wallet && input.name && input.description, 400, "INVALID_BODY", "publisher_wallet, name, and description are required");
  invariant(actor.wallet === input.publisher_wallet || actor.role === "admin", 403, "FORBIDDEN", "publisher wallet authorization required");
  const now = store.now();
  const agent: Agent = {
    id: store.nextId("agent"),
    publisherWallet: input.publisher_wallet,
    name: input.name,
    description: input.description,
    status: input.status ?? "active",
    reputationScore: input.reputation_score ?? 0,
    successRate: input.success_rate ?? 0,
    avgLatencyMs: input.avg_latency_ms ?? 0,
    qualityScore: input.quality_score ?? 0,
    delegationSuccessRate: input.delegation_success_rate ?? 0,
    historicalEarningsLamports: input.historical_earnings_lamports ?? "0",
    stakeAmount: input.stake_amount ?? "0",
    verifiedCompletionRate: 0,
    onTimeDeliveryRate: 0,
    disputeRate: 0,
    unsafeArtifactRate: 0,
    refundRate: 0,
    totalTasksCompleted: 0,
    totalTasksFailed: 0,
    totalDisputes: 0,
    createdAt: now,
    updatedAt: now,
  };
  await store.saveAgent(agent);
  return agent;
};

export const registerSkill = async (store: DataStore, actor: Actor, agentId: string, input: RegisterSkillInput): Promise<Skill> => {
  const agent = await store.getAgent(agentId);
  invariant(agent, 404, "NOT_FOUND", "agent not found");
  requirePublisher(actor, agent);
  invariant(input.name && input.description, 400, "INVALID_BODY", "name and description are required");
  invariant(/^\d+$/.test(input.base_price_lamports), 400, "INVALID_BODY", "base_price_lamports must be a non-negative integer string");
  invariant(input.estimated_latency_ms >= 0, 400, "INVALID_BODY", "estimated_latency_ms must be non-negative");
  invariant(isJsonSchemaObject(input.input_schema ?? {}), 400, "INVALID_BODY", "input_schema must be a JSON Schema object");
  invariant(isJsonSchemaObject(input.output_schema ?? {}), 400, "INVALID_BODY", "output_schema must be a JSON Schema object");
  invariant(
    !(await store.findSkillByAgentName(agentId, input.name)),
    409,
    "CONFLICT",
    "skill names must be unique per agent",
  );
  const now = store.now();
  const skill: Skill = {
    id: store.nextId("skill"),
    agentId,
    name: input.name,
    description: input.description,
    inputSchema: input.input_schema ?? {},
    outputSchema: input.output_schema ?? {},
    basePriceLamports: input.base_price_lamports,
    estimatedLatencyMs: input.estimated_latency_ms,
    requiredPermissions: input.required_permissions ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await store.saveSkill(skill);
  return skill;
};
