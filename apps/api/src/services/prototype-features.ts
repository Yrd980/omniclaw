import { invariant } from "../errors";
import type { DataStore } from "../store";
import type { Actor, Agent, AgentBid, JsonObject, SkillCredential, SkillCredentialRarity, StakeEvent, TokenAccount, TokenTransfer } from "../types";

export type CreateBidInput = {
  bidder_agent_id: string;
  skill_id: string;
  price_lamports: string;
  message?: string;
};

export const createBid = async (store: DataStore, actor: Actor, taskId: string, input: CreateBidInput): Promise<AgentBid> => {
  const task = await store.getTask(taskId);
  const agent = await store.getAgent(input.bidder_agent_id);
  const skill = await store.getSkill(input.skill_id);
  invariant(task, 404, "NOT_FOUND", "task not found");
  invariant(agent, 404, "NOT_FOUND", "bidder agent not found");
  invariant(skill, 404, "NOT_FOUND", "skill not found");
  invariant(skill.agentId === agent.id, 400, "INVALID_BODY", "skill does not belong to bidder");
  invariant(actor.agentId === agent.id || actor.wallet === agent.publisherWallet || actor.role === "admin", 403, "FORBIDDEN", "bidder authorization required");
  invariant(["created", "escrow_locked"].includes(task.status), 409, "CONFLICT", "bids can only be submitted before task acceptance");
  const now = store.now();
  const bid: AgentBid = {
    id: store.nextId("bid"),
    taskId,
    bidderAgentId: agent.id,
    skillId: skill.id,
    priceLamports: input.price_lamports,
    message: input.message ?? "",
    status: "submitted",
    createdAt: now,
    updatedAt: now,
  };
  await store.saveBid(bid);
  return bid;
};

export const listBids = async (store: DataStore, taskId: string): Promise<AgentBid[]> => {
  invariant(await store.getTask(taskId), 404, "NOT_FOUND", "task not found");
  return store.listBidsByTask(taskId);
};

export const acceptBid = async (store: DataStore, actor: Actor, taskId: string, bidId: string): Promise<AgentBid> => {
  const task = await store.getTask(taskId);
  const bid = await store.getBid(bidId);
  invariant(task, 404, "NOT_FOUND", "task not found");
  invariant(bid && bid.taskId === taskId, 404, "NOT_FOUND", "bid not found");
  invariant(actor.agentId === task.hirerAgentId || actor.role === "admin", 403, "FORBIDDEN", "hirer authorization required");
  invariant(bid.status === "submitted", 409, "CONFLICT", "bid is already closed");
  const now = store.now();
  bid.status = "accepted";
  bid.updatedAt = now;
  await store.saveBid(bid);
  for (const other of await store.listBidsByTask(taskId)) {
    if (other.id !== bid.id && other.status === "submitted") {
      other.status = "rejected";
      other.updatedAt = now;
      await store.saveBid(other);
    }
  }
  return bid;
};

export const updateStake = async (store: DataStore, actor: Actor, agentId: string, amountLamports: string, direction: "stake" | "unstake"): Promise<{ agent: Agent; event: StakeEvent }> => {
  const agent = await store.getAgent(agentId);
  invariant(agent, 404, "NOT_FOUND", "agent not found");
  invariant(actor.wallet === agent.publisherWallet || actor.agentId === agent.id || actor.role === "admin", 403, "FORBIDDEN", "stake authorization required");
  const current = BigInt(agent.stakeAmount);
  const delta = BigInt(amountLamports);
  const next = direction === "stake" ? current + delta : current - delta;
  invariant(next >= 0n, 400, "INVALID_BODY", "cannot unstake more than current stake");
  const now = store.now();
  agent.stakeAmount = next.toString();
  agent.updatedAt = now;
  await store.saveAgent(agent);
  const event: StakeEvent = {
    id: store.nextId("stake"),
    agentId,
    wallet: agent.publisherWallet,
    eventType: direction === "stake" ? "staked" : "unstaked",
    amountLamports,
    resultingStakeLamports: agent.stakeAmount,
    createdAt: now,
  };
  await store.saveStakeEvent(event);
  return { agent, event };
};

export const mintSkillCredential = async (
  store: DataStore,
  actor: Actor,
  skillId: string,
  input: { name?: string; rarity?: SkillCredentialRarity; metadata?: JsonObject },
): Promise<SkillCredential> => {
  const skill = await store.getSkill(skillId);
  invariant(skill, 404, "NOT_FOUND", "skill not found");
  const agent = await store.getAgent(skill.agentId);
  invariant(agent, 404, "NOT_FOUND", "skill agent not found");
  invariant(actor.wallet === agent.publisherWallet || actor.agentId === agent.id || actor.role === "admin", 403, "FORBIDDEN", "skill credential authorization required");
  const credential: SkillCredential = {
    id: store.nextId("cred"),
    skillId,
    agentId: agent.id,
    ownerWallet: agent.publisherWallet,
    name: input.name ?? `${skill.name} credential`,
    rarity: input.rarity ?? rarityFor(agent.reputationScore, agent.qualityScore),
    metadata: input.metadata ?? { skill: skill.name, description: skill.description },
    mintedAt: store.now(),
  };
  await store.saveSkillCredential(credential);
  return credential;
};

export const creditToken = async (store: DataStore, actor: Actor, wallet: string, symbol: string, amountLamports: string, taskId: string | null = null): Promise<{ account: TokenAccount; transfer: TokenTransfer }> => {
  invariant(actor.wallet === wallet || actor.role === "admin", 403, "FORBIDDEN", "wallet authorization required");
  const account = await upsertTokenAccount(store, wallet, symbol, BigInt(amountLamports));
  const transfer: TokenTransfer = {
    id: store.nextId("tok"),
    wallet,
    fromSymbol: null,
    toSymbol: normalizeSymbol(symbol),
    amountLamports,
    receivedLamports: amountLamports,
    transferType: "credit",
    taskId,
    createdAt: store.now(),
  };
  await store.saveTokenTransfer(transfer);
  return { account, transfer };
};

export const swapToken = async (store: DataStore, actor: Actor, wallet: string, fromSymbol: string, toSymbol: string, amountLamports: string): Promise<{ debited: TokenAccount; credited: TokenAccount; transfer: TokenTransfer }> => {
  invariant(actor.wallet === wallet || actor.role === "admin", 403, "FORBIDDEN", "wallet authorization required");
  const from = await store.getTokenAccount(wallet, normalizeSymbol(fromSymbol));
  invariant(from, 404, "NOT_FOUND", "source token account not found");
  const amount = BigInt(amountLamports);
  invariant(BigInt(from.balanceLamports) >= amount, 400, "INVALID_BODY", "insufficient token balance");
  from.balanceLamports = (BigInt(from.balanceLamports) - amount).toString();
  from.updatedAt = store.now();
  await store.saveTokenAccount(from);
  const receivedLamports = amount.toString();
  const credited = await upsertTokenAccount(store, wallet, toSymbol, receivedLamports);
  const transfer: TokenTransfer = {
    id: store.nextId("tok"),
    wallet,
    fromSymbol: normalizeSymbol(fromSymbol),
    toSymbol: normalizeSymbol(toSymbol),
    amountLamports,
    receivedLamports,
    transferType: "swap",
    taskId: null,
    createdAt: store.now(),
  };
  await store.saveTokenTransfer(transfer);
  return { debited: from, credited, transfer };
};

export const getProfile = async (store: DataStore, wallet: string) => {
  const agents = (await store.listAgents()).filter((agent) => agent.publisherWallet === wallet);
  const tasks = (await store.listTasks()).filter((task) => agents.some((agent) => agent.id === task.hirerAgentId || agent.id === task.workerAgentId));
  const settlementEvents = (await store.listSettlementEvents()).filter((event) => event.fromWallet === wallet || event.toWallet === wallet || tasks.some((task) => task.id === event.taskId));
  const tokenAccounts = await store.listTokenAccountsByWallet(wallet);
  const tokenTransfers = await store.listTokenTransfersByWallet(wallet);
  const skillCredentials = (await Promise.all(agents.map((agent) => store.listSkillCredentialsByAgent(agent.id)))).flat();
  return { wallet, agents, tasks, settlementEvents, tokenAccounts, tokenTransfers, skillCredentials };
};

const upsertTokenAccount = async (store: DataStore, wallet: string, symbol: string, deltaLamports: bigint | string): Promise<TokenAccount> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const existing = await store.getTokenAccount(wallet, normalizedSymbol);
  const nextBalance = (BigInt(existing?.balanceLamports ?? "0") + BigInt(deltaLamports)).toString();
  const account: TokenAccount = existing
    ? { ...existing, balanceLamports: nextBalance, updatedAt: store.now() }
    : { id: store.nextId("acct"), wallet, symbol: normalizedSymbol, balanceLamports: nextBalance, updatedAt: store.now() };
  await store.saveTokenAccount(account);
  return account;
};

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const rarityFor = (reputation: number, quality: number): SkillCredentialRarity => {
  const score = (reputation + quality) / 2;
  if (score >= 95) return "legendary";
  if (score >= 88) return "epic";
  if (score >= 75) return "rare";
  return "uncommon";
};
