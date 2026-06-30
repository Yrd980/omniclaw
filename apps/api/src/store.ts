import type { Agent, ArtifactCheck, DeliveryManifest, Dispute, ExecutionQueueItem, ReputationEvent, SettlementEvent, Skill, Task, TaskResult } from "./types";

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
  saveDeliveryManifest(manifest: DeliveryManifest): Promise<void>;
  getDeliveryManifestByTaskResultId(taskResultId: string): Promise<DeliveryManifest | undefined>;
  getDeliveryManifestByTaskId(taskId: string): Promise<DeliveryManifest | undefined>;
  updateDeliveryManifest(manifest: DeliveryManifest): Promise<void>;
  saveArtifactCheck(check: ArtifactCheck): Promise<void>;
  listArtifactChecksByTaskId(taskId: string): Promise<ArtifactCheck[]>;
  listArtifactChecksByTaskResultId(taskResultId: string): Promise<ArtifactCheck[]>;
  updateArtifactCheck(check: ArtifactCheck): Promise<void>;
  saveDispute(dispute: Dispute): Promise<void>;
  getDispute(id: string): Promise<Dispute | undefined>;
  listDisputes(filters: DisputeFilters): Promise<Dispute[]>;
  updateDispute(dispute: Dispute): Promise<void>;
  saveExecutionQueueItem(item: ExecutionQueueItem): Promise<void>;
  getExecutionQueueItem(id: string): Promise<ExecutionQueueItem | undefined>;
  getExecutionQueueItemByTaskId(taskId: string): Promise<ExecutionQueueItem | undefined>;
  listExecutionQueueItems(filters: ExecutionQueueFilters): Promise<ExecutionQueueItem[]>;
  updateExecutionQueueItem(item: ExecutionQueueItem): Promise<void>;
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

export type DisputeFilters = {
  taskId?: string;
  status?: string;
  evaluatorAgentId?: string;
};

export type ExecutionQueueFilters = {
  taskId?: string;
  status?: string;
};

export type DataStore = StoreRepository & {
  agents: Map<string, Agent>;
  skills: Map<string, Skill>;
  tasks: Map<string, Task>;
  taskResults: Map<string, TaskResult>;
  reputationEvents: Map<string, ReputationEvent>;
  settlementEvents: Map<string, SettlementEvent>;
  deliveryManifests: Map<string, DeliveryManifest>;
  artifactChecks: Map<string, ArtifactCheck>;
  disputes: Map<string, Dispute>;
  executionQueue: Map<string, ExecutionQueueItem>;
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
    deliveryManifests: new Map(),
    artifactChecks: new Map(),
    disputes: new Map(),
    executionQueue: new Map(),
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
    async saveDeliveryManifest(manifest: DeliveryManifest) {
      this.deliveryManifests.set(manifest.id, manifest);
    },
    async getDeliveryManifestByTaskResultId(taskResultId: string) {
      return [...this.deliveryManifests.values()].find((m) => m.taskResultId === taskResultId);
    },
    async getDeliveryManifestByTaskId(taskId: string) {
      return [...this.deliveryManifests.values()].find((m) => m.taskId === taskId);
    },
    async updateDeliveryManifest(manifest: DeliveryManifest) {
      this.deliveryManifests.set(manifest.id, manifest);
    },
    async saveArtifactCheck(check: ArtifactCheck) {
      this.artifactChecks.set(check.id, check);
    },
    async listArtifactChecksByTaskId(taskId: string) {
      return [...this.artifactChecks.values()].filter((c) => c.taskId === taskId);
    },
    async listArtifactChecksByTaskResultId(taskResultId: string) {
      return [...this.artifactChecks.values()].filter((c) => c.taskResultId === taskResultId);
    },
    async updateArtifactCheck(check: ArtifactCheck) {
      this.artifactChecks.set(check.id, check);
    },
    async saveDispute(dispute: Dispute) {
      this.disputes.set(dispute.id, dispute);
    },
    async getDispute(id: string) {
      return this.disputes.get(id);
    },
    async listDisputes(filters: DisputeFilters) {
      return [...this.disputes.values()].filter((d) =>
        (filters.taskId === undefined || d.taskId === filters.taskId) &&
        (filters.status === undefined || d.status === filters.status) &&
        (filters.evaluatorAgentId === undefined || d.evaluatorAgentId === filters.evaluatorAgentId)
      );
    },
    async updateDispute(dispute: Dispute) {
      this.disputes.set(dispute.id, dispute);
    },
    async saveExecutionQueueItem(item: ExecutionQueueItem) {
      this.executionQueue.set(item.id, item);
    },
    async getExecutionQueueItem(id: string) {
      return this.executionQueue.get(id);
    },
    async getExecutionQueueItemByTaskId(taskId: string) {
      return [...this.executionQueue.values()].find((i) => i.taskId === taskId);
    },
    async listExecutionQueueItems(filters: ExecutionQueueFilters) {
      return [...this.executionQueue.values()].filter((i) =>
        (filters.taskId === undefined || i.taskId === filters.taskId) &&
        (filters.status === undefined || i.status === filters.status)
      );
    },
    async updateExecutionQueueItem(item: ExecutionQueueItem) {
      this.executionQueue.set(item.id, item);
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
