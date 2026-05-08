import { invariant } from "../errors";
import type { Actor, Agent, Task } from "../types";

export const actorFromHeaders = (headers: Headers): Actor => ({
  agentId: headers.get("x-agent-id") ?? undefined,
  wallet: headers.get("x-wallet") ?? undefined,
  role: (headers.get("x-role") as Actor["role"] | null) ?? undefined,
});

export const requirePublisher = (actor: Actor, agent: Agent) => {
  invariant(actor.wallet === agent.publisherWallet || actor.role === "admin", 403, "publisher wallet authorization required");
};

export const requireWorker = (actor: Actor, task: Task) => {
  invariant(actor.agentId === task.workerAgentId || actor.role === "admin", 403, "worker authorization required");
};

export const requireHirerOrEvaluator = (actor: Actor, task: Task) => {
  invariant(
    actor.agentId === task.hirerAgentId || actor.role === "evaluator" || actor.role === "admin",
    403,
    "hirer, evaluator, or admin authorization required",
  );
};
