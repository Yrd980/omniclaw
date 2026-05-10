import type { Agent, AgentBid, ReputationEvent, SettlementEvent, Skill, SkillCredential, StakeEvent, Task, TaskResult, TokenAccount, TokenTransfer } from "./types";

export type StoreRepository = {
  getAgent(id: string): Promise<Agent | undefined>;
  saveAgent(agent: Agent): Promise<void>;
  listAgents(): Promise<Agent[]>;
  getSkill(id: string): Promise<Skill | undefined>;
  findSkillByAgentName(agentId: string, name: string): Promise<Skill | undefined>;
  saveSkill(skill: Skill): Promise<void>;
  listSkills(): Promise<Skill[]>;
  getTask(id: string): Promise<Task | undefined>;
  saveTask(task: Task): Promise<void>;
  listTasks(): Promise<Task[]>;
  listTasksByFilters(filters: TaskFilters): Promise<Task[]>;
  saveTaskResult(taskResult: TaskResult): Promise<void>;
  getTaskResultForTask(taskId: string): Promise<TaskResult | undefined>;
  saveReputationEvent(reputationEvent: ReputationEvent): Promise<void>;
  listReputationEvents(): Promise<ReputationEvent[]>;
  listReputationEventsByFilters(filters: EventFilters): Promise<ReputationEvent[]>;
  saveSettlementEvent(settlementEvent: SettlementEvent): Promise<void>;
  listSettlementEvents(): Promise<SettlementEvent[]>;
  listSettlementEventsByFilters(filters: EventFilters): Promise<SettlementEvent[]>;
  listSettlementEventsForTask(taskId: string): Promise<SettlementEvent[]>;
  hasSettlementEvent(taskId: string, eventType: SettlementEvent["eventType"]): Promise<boolean>;
  saveBid(bid: AgentBid): Promise<void>;
  getBid(id: string): Promise<AgentBid | undefined>;
  listBidsByTask(taskId: string): Promise<AgentBid[]>;
  saveStakeEvent(event: StakeEvent): Promise<void>;
  listStakeEventsByAgent(agentId: string): Promise<StakeEvent[]>;
  saveSkillCredential(credential: SkillCredential): Promise<void>;
  listSkillCredentialsByAgent(agentId: string): Promise<SkillCredential[]>;
  listSkillCredentialsBySkill(skillId: string): Promise<SkillCredential[]>;
  saveTokenAccount(account: TokenAccount): Promise<void>;
  getTokenAccount(wallet: string, symbol: string): Promise<TokenAccount | undefined>;
  listTokenAccountsByWallet(wallet: string): Promise<TokenAccount[]>;
  saveTokenTransfer(transfer: TokenTransfer): Promise<void>;
  listTokenTransfersByWallet(wallet: string): Promise<TokenTransfer[]>;
};

export type TaskFilters = {
  hirerAgentId?: string;
  workerAgentId?: string;
  status?: Task["status"];
  parentTaskId?: string | null;
  deadlineFrom?: string;
  deadlineTo?: string;
};

export type EventFilters = {
  taskId?: string;
  agentId?: string;
};

export type DataStore = StoreRepository & {
  agents: Map<string, Agent>;
  skills: Map<string, Skill>;
  tasks: Map<string, Task>;
  taskResults: Map<string, TaskResult>;
  reputationEvents: Map<string, ReputationEvent>;
  settlementEvents: Map<string, SettlementEvent>;
  bids: Map<string, AgentBid>;
  stakeEvents: Map<string, StakeEvent>;
  skillCredentials: Map<string, SkillCredential>;
  tokenAccounts: Map<string, TokenAccount>;
  tokenTransfers: Map<string, TokenTransfer>;
  nextId(prefix: string): string;
  now(): string;
};

export const createMemoryStore = (): DataStore => {
  const counters = new Map<string, number>();
  return {
    agents: new Map(),
    skills: new Map(),
    tasks: new Map(),
    taskResults: new Map(),
    reputationEvents: new Map(),
    settlementEvents: new Map(),
    bids: new Map(),
    stakeEvents: new Map(),
    skillCredentials: new Map(),
    tokenAccounts: new Map(),
    tokenTransfers: new Map(),
    nextId(prefix: string) {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}_${String(next).padStart(6, "0")}`;
    },
    now() {
      return new Date().toISOString();
    },
    async getAgent(id: string) {
      return this.agents.get(id);
    },
    async saveAgent(agent: Agent) {
      this.agents.set(agent.id, agent);
    },
    async listAgents() {
      return [...this.agents.values()];
    },
    async getSkill(id: string) {
      return this.skills.get(id);
    },
    async findSkillByAgentName(agentId: string, name: string) {
      return [...this.skills.values()].find((skill) => skill.agentId === agentId && skill.name === name);
    },
    async saveSkill(skill: Skill) {
      this.skills.set(skill.id, skill);
    },
    async listSkills() {
      return [...this.skills.values()];
    },
    async getTask(id: string) {
      return this.tasks.get(id);
    },
    async saveTask(task: Task) {
      this.tasks.set(task.id, task);
    },
    async listTasks() {
      return [...this.tasks.values()];
    },
    async listTasksByFilters(filters: TaskFilters) {
      return filterTasks([...this.tasks.values()], filters);
    },
    async saveTaskResult(taskResult: TaskResult) {
      this.taskResults.set(taskResult.id, taskResult);
    },
    async getTaskResultForTask(taskId: string) {
      return [...this.taskResults.values()].find((taskResult) => taskResult.taskId === taskId);
    },
    async saveReputationEvent(reputationEvent: ReputationEvent) {
      this.reputationEvents.set(reputationEvent.id, reputationEvent);
    },
    async listReputationEvents() {
      return [...this.reputationEvents.values()];
    },
    async listReputationEventsByFilters(filters: EventFilters) {
      return [...this.reputationEvents.values()].filter((event) =>
        (filters.taskId === undefined || event.taskId === filters.taskId) &&
        (filters.agentId === undefined || event.agentId === filters.agentId)
      );
    },
    async saveSettlementEvent(settlementEvent: SettlementEvent) {
      this.settlementEvents.set(settlementEvent.id, settlementEvent);
    },
    async listSettlementEvents() {
      return [...this.settlementEvents.values()];
    },
    async listSettlementEventsByFilters(filters: EventFilters) {
      return [...this.settlementEvents.values()].filter((event) => filters.taskId === undefined || event.taskId === filters.taskId);
    },
    async listSettlementEventsForTask(taskId: string) {
      return [...this.settlementEvents.values()].filter((event) => event.taskId === taskId);
    },
    async hasSettlementEvent(taskId: string, eventType: SettlementEvent["eventType"]) {
      return [...this.settlementEvents.values()].some((event) => event.taskId === taskId && event.eventType === eventType);
    },
    async saveBid(bid: AgentBid) {
      this.bids.set(bid.id, bid);
    },
    async getBid(id: string) {
      return this.bids.get(id);
    },
    async listBidsByTask(taskId: string) {
      return [...this.bids.values()].filter((bid) => bid.taskId === taskId);
    },
    async saveStakeEvent(event: StakeEvent) {
      this.stakeEvents.set(event.id, event);
    },
    async listStakeEventsByAgent(agentId: string) {
      return [...this.stakeEvents.values()].filter((event) => event.agentId === agentId);
    },
    async saveSkillCredential(credential: SkillCredential) {
      this.skillCredentials.set(credential.id, credential);
    },
    async listSkillCredentialsByAgent(agentId: string) {
      return [...this.skillCredentials.values()].filter((credential) => credential.agentId === agentId);
    },
    async listSkillCredentialsBySkill(skillId: string) {
      return [...this.skillCredentials.values()].filter((credential) => credential.skillId === skillId);
    },
    async saveTokenAccount(account: TokenAccount) {
      this.tokenAccounts.set(tokenAccountKey(account.wallet, account.symbol), account);
    },
    async getTokenAccount(wallet: string, symbol: string) {
      return this.tokenAccounts.get(tokenAccountKey(wallet, symbol));
    },
    async listTokenAccountsByWallet(wallet: string) {
      return [...this.tokenAccounts.values()].filter((account) => account.wallet === wallet);
    },
    async saveTokenTransfer(transfer: TokenTransfer) {
      this.tokenTransfers.set(transfer.id, transfer);
    },
    async listTokenTransfersByWallet(wallet: string) {
      return [...this.tokenTransfers.values()].filter((transfer) => transfer.wallet === wallet);
    },
  };
};

export const filterTasks = (tasks: Task[], filters: TaskFilters): Task[] =>
  tasks.filter((task) =>
    (filters.hirerAgentId === undefined || task.hirerAgentId === filters.hirerAgentId) &&
    (filters.workerAgentId === undefined || task.workerAgentId === filters.workerAgentId) &&
    (filters.status === undefined || task.status === filters.status) &&
    (filters.parentTaskId === undefined || task.parentTaskId === filters.parentTaskId) &&
    (filters.deadlineFrom === undefined || new Date(task.deadline).getTime() >= new Date(filters.deadlineFrom).getTime()) &&
    (filters.deadlineTo === undefined || new Date(task.deadline).getTime() <= new Date(filters.deadlineTo).getTime())
  );

export const tokenAccountKey = (wallet: string, symbol: string) => `${wallet}:${symbol.toUpperCase()}`;
