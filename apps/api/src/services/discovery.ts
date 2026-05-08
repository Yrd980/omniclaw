import { DEFAULT_DISCOVERY_RANKING_CONFIG, type DiscoveryRankingConfig } from "../config";
import type { DataStore } from "../store";
import type { Agent, Skill } from "../types";

export type DiscoveryQuery = {
  capability?: string;
  reputation_gt?: string;
  latency_lt_ms?: string;
  max_price_lamports?: string;
  status?: string;
};

export type DiscoveryResult = {
  agent: Agent;
  skill: Skill;
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

export const discoverAgents = (
  store: DataStore,
  query: DiscoveryQuery,
  config: DiscoveryRankingConfig = DEFAULT_DISCOVERY_RANKING_CONFIG,
): Promise<DiscoveryResult[]> => discoverAgentsFromRows(store, query, config);

const discoverAgentsFromRows = async (
  store: DataStore,
  query: DiscoveryQuery,
  config: DiscoveryRankingConfig,
): Promise<DiscoveryResult[]> => {
  const capability = query.capability?.toLowerCase();
  const minRep = query.reputation_gt === undefined ? undefined : Number(query.reputation_gt);
  const maxLatency = query.latency_lt_ms === undefined ? undefined : Number(query.latency_lt_ms);
  const maxPrice = query.max_price_lamports === undefined ? undefined : BigInt(query.max_price_lamports);
  const status = query.status;
  const agentsById = new Map((await store.listAgents()).map((agent) => [agent.id, agent]));

  return (await store.listSkills())
    .filter((skill) => !capability || skill.name.toLowerCase() === capability || skill.description.toLowerCase().includes(capability))
    .map((skill) => ({ skill, agent: agentsById.get(skill.agentId) }))
    .filter((row): row is { skill: Skill; agent: Agent } => Boolean(row.agent))
    .filter(({ agent }) => !status || agent.status === status)
    .filter(({ agent }) => minRep === undefined || agent.reputationScore > minRep)
    .filter(({ skill }) => maxLatency === undefined || skill.estimatedLatencyMs < maxLatency)
    .filter(({ skill }) => maxPrice === undefined || BigInt(skill.basePriceLamports) <= maxPrice)
    .map(({ agent, skill }) => {
      const ranking = rankingMetadata(agent, skill, capability, config);
      return { agent, skill, ranking };
    })
    .sort(compareDiscoveryResults);
};

const compareDiscoveryResults = (a: DiscoveryResult, b: DiscoveryResult): number =>
  b.ranking.score - a.ranking.score ||
  b.agent.reputationScore - a.agent.reputationScore ||
  b.agent.successRate - a.agent.successRate ||
  compareBigInt(BigInt(a.skill.basePriceLamports), BigInt(b.skill.basePriceLamports)) ||
  a.skill.estimatedLatencyMs - b.skill.estimatedLatencyMs ||
  a.agent.id.localeCompare(b.agent.id);

const compareBigInt = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0);

const rankingMetadata = (agent: Agent, skill: Skill, capability: string | undefined, config: DiscoveryRankingConfig) => {
  const skillMatch = !capability
    ? 0
    : skill.name.toLowerCase() === capability
      ? config.exactSkillMatchScore
      : config.descriptionSkillMatchScore;
  const reputation = agent.reputationScore;
  const successRate = agent.successRate;
  const quality = agent.qualityScore;
  const latency = Math.max(0, config.maxComponentScore - skill.estimatedLatencyMs / 1000);
  const price = Math.max(0, config.maxComponentScore - Number(BigInt(skill.basePriceLamports) / config.lamportsPerPricePoint));
  const stake = Math.min(config.maxComponentScore, Number(BigInt(agent.stakeAmount) / config.lamportsPerStakePoint));
  const score =
    skillMatch * config.weights.skillMatch +
    reputation * config.weights.reputation +
    successRate * config.weights.successRate +
    quality * config.weights.quality +
    latency * config.weights.latency +
    price * config.weights.price +
    stake * config.weights.stake;
  return { score, skillMatch, reputation, successRate, quality, latency, price, stake };
};
