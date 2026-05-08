import type { Agent, ReputationEvent, SettlementEvent, Skill, Task, TaskResult } from "./types";

export type DataStore = {
  agents: Map<string, Agent>;
  skills: Map<string, Skill>;
  tasks: Map<string, Task>;
  taskResults: Map<string, TaskResult>;
  reputationEvents: Map<string, ReputationEvent>;
  settlementEvents: Map<string, SettlementEvent>;
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
    nextId(prefix: string) {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}_${String(next).padStart(6, "0")}`;
    },
    now() {
      return new Date().toISOString();
    },
  };
};
