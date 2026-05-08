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
  submitResult?: boolean;
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

export class GrpcRuntimeAdapter implements RuntimeAdapter {
  private clientPromise: Promise<GrpcRuntimeClient> | null = null;

  constructor(
    private readonly target: string,
    private readonly protoPath = new URL("../../../../packages/proto/agent_runtime.proto", import.meta.url).pathname,
  ) {}

  async dispatch(payload: RuntimeAcceptedTaskPayload): Promise<RuntimeDispatchResult> {
    const response = await this.dispatchGrpc(toGrpcDispatchRequest(payload));
    return {
      accepted: response.accepted === true,
      submitResult: true,
      resultPayload: parseJsonObject(response.resultPayload?.json),
      artifacts: Array.isArray(response.artifacts) ? response.artifacts.map((artifact) => parseJsonValue(artifact.json)) : [],
    };
  }

  protected async dispatchGrpc(request: GrpcDispatchRequest): Promise<GrpcDispatchResponse> {
    const client = await this.client();
    return await new Promise<GrpcDispatchResponse>((resolve, reject) => {
      client.DispatchTask(request, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  private async client(): Promise<GrpcRuntimeClient> {
    this.clientPromise ??= createGrpcRuntimeClient(this.target, this.protoPath);
    return this.clientPromise;
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

type GrpcRuntimeClient = {
  DispatchTask(request: GrpcDispatchRequest, callback: (error: Error | null, response: GrpcDispatchResponse) => void): void;
};

type GrpcDispatchRequest = {
  taskId: string;
  parentTaskId?: string;
  hirerAgentId: string;
  workerAgentId: string;
  skillId: string;
  taskPayload: { json: string };
  paymentLamports: string;
  workerPayoutLamports: string;
  deadline: string;
  acceptedAt?: string;
  callback: {
    method: "POST";
    path: string;
    actorHeaders: Record<string, string>;
  };
};

type GrpcDispatchResponse = {
  accepted: boolean;
  resultPayload?: { json: string };
  artifacts?: Array<{ json: string }>;
};

const createGrpcRuntimeClient = async (target: string, protoPath: string): Promise<GrpcRuntimeClient> => {
  const grpc = await import("@grpc/grpc-js");
  const protoLoader = await import("@grpc/proto-loader");
  const packageDefinition = protoLoader.loadSync(protoPath, {
    defaults: true,
    keepCase: false,
    longs: String,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as Record<string, unknown>;
  const runtimePackage = (((loaded.omniclaw as Record<string, unknown>).runtime as Record<string, unknown>).v1 as Record<string, unknown>);
  const Client = runtimePackage.AgentRuntimeService as new (target: string, credentials: unknown) => GrpcRuntimeClient;
  return new Client(target, grpc.credentials.createInsecure());
};

const toGrpcDispatchRequest = (payload: RuntimeAcceptedTaskPayload): GrpcDispatchRequest => ({
  taskId: payload.task_id,
  ...(payload.parent_task_id ? { parentTaskId: payload.parent_task_id } : {}),
  hirerAgentId: payload.hirer_agent_id,
  workerAgentId: payload.worker_agent_id,
  skillId: payload.skill_id,
  taskPayload: { json: JSON.stringify(payload.task_payload) },
  paymentLamports: payload.payment_lamports,
  workerPayoutLamports: payload.worker_payout_lamports,
  deadline: payload.deadline,
  ...(payload.accepted_at ? { acceptedAt: payload.accepted_at } : {}),
  callback: {
    method: payload.callback.method,
    path: payload.callback.path,
    actorHeaders: payload.callback.actor_headers,
  },
});

const parseJsonObject = (value: string | undefined): JsonObject | undefined => {
  const parsed = parseJsonValue(value);
  return isJsonObject(parsed) ? parsed : undefined;
};

const parseJsonValue = (value: string | undefined): unknown => {
  if (!value) {
    return {};
  }
  return JSON.parse(value);
};
