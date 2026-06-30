import { verifySiwsChallenge, type SiwsConfig } from "../auth/siws";
import type { RuntimeConfig } from "../config";
import { ApiError, invariant } from "../errors";
import type { Actor, Agent, Task } from "../types";

export const actorFromHeaders = async (headers: Headers, config?: RuntimeConfig): Promise<Actor> => {
  if (config?.authMode === "signed") {
    const siwsConfig: SiwsConfig = {
      domain: process.env.OMNICLAW_SIWS_DOMAIN ?? "localhost:3000",
      nonceExpirySeconds: Number(process.env.OMNICLAW_SIWS_NONCE_EXPIRY ?? "300"),
    };
    return verifySiwsChallenge(headers, siwsConfig);
  }

  const role = headers.get("x-role");
  if (role !== null && role !== "admin" && role !== "evaluator") {
    throw new ApiError(400, "INVALID_HEADER", "x-role must be admin or evaluator", { header: "x-role" });
  }
  return {
    agentId: headers.get("x-agent-id") ?? undefined,
    wallet: headers.get("x-wallet") ?? undefined,
    role: role ?? undefined,
  };
};

export const requirePublisher = (actor: Actor, agent: Agent) => {
  invariant(actor.wallet === agent.publisherWallet || actor.role === "admin", 403, "FORBIDDEN", "publisher wallet authorization required");
};

export const requireWorker = (actor: Actor, task: Task) => {
  invariant(actor.agentId === task.workerAgentId || actor.role === "admin", 403, "FORBIDDEN", "worker authorization required");
};

export const requireHirerOrEvaluator = (actor: Actor, task: Task) => {
  invariant(
    actor.agentId === task.hirerAgentId || actor.role === "evaluator" || actor.role === "admin",
    403,
    "FORBIDDEN",
    "hirer, evaluator, or admin authorization required",
  );
};
