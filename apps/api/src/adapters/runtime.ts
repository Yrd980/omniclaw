import type { JsonObject, Task } from "../types";

export type RuntimeAcceptedTaskPayload = {
  task_id: string;
  parent_task_id: string | null;
  hirer_agent_id: string;
  worker_agent_id: string;
  skill_id: string;
  task_payload: JsonObject;
  payment_lamports: string;
  worker_payout_lamports: string;
  deadline: string;
  accepted_at: string | null;
  callback: {
    method: "POST";
    path: `/tasks/${string}/result`;
    actor_headers: {
      "x-agent-id": string;
    };
  };
};

export type RuntimeSubmitResultPayload = {
  result_payload: JsonObject;
  artifacts?: unknown[];
};

export type RuntimeDispatchResult = {
  accepted: boolean;
  resultPayload?: JsonObject;
  artifacts?: unknown[];
};

export interface RuntimeAdapter {
  dispatch(payload: RuntimeAcceptedTaskPayload): Promise<RuntimeDispatchResult>;
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  async dispatch(payload: RuntimeAcceptedTaskPayload): Promise<RuntimeDispatchResult> {
    return {
      accepted: true,
      resultPayload: {
        task_id: payload.task_id,
        mock: true,
        echo: payload.task_payload,
      },
      artifacts: [],
    };
  }
}

export class HttpCallbackRuntimeAdapter implements RuntimeAdapter {
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async dispatch(payload: RuntimeAcceptedTaskPayload): Promise<RuntimeDispatchResult> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`runtime callback dispatch failed with HTTP ${response.status}`);
    }
    const body = await response.json();
    return {
      accepted: body.accepted === true,
      resultPayload: isJsonObject(body.result_payload) ? body.result_payload : undefined,
      artifacts: Array.isArray(body.artifacts) ? body.artifacts : undefined,
    };
  }
}

export const runtimeAcceptedTaskPayload = (task: Task): RuntimeAcceptedTaskPayload => ({
  task_id: task.id,
  parent_task_id: task.parentTaskId,
  hirer_agent_id: task.hirerAgentId,
  worker_agent_id: task.workerAgentId,
  skill_id: task.skillId,
  task_payload: task.taskPayload,
  payment_lamports: task.paymentLamports,
  worker_payout_lamports: task.workerPayoutLamports,
  deadline: task.deadline,
  accepted_at: task.acceptedAt,
  callback: {
    method: "POST",
    path: `/tasks/${task.id}/result`,
    actor_headers: {
      "x-agent-id": task.workerAgentId,
    },
  },
});

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
