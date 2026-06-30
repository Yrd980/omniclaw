import { OmniClawApiError } from "./errors";
import type {
  ActorHeaders,
  AgentDto,
  ArtifactCheckDto,
  CreateTaskInput,
  DiscoverAgentsFilters,
  DisputeDto,
  DiscoveryResultDto,
  EventFilters,
  ExecutionQueueItemDto,
  HealthDto,
  ListTasksFilters,
  NonceDto,
  OmniClawApiErrorEnvelope,
  OpenDisputeInput,
  OperatorAgentSuspensionDto,
  OperatorSettlementFailureDto,
  RegisterAgentInput,
  RegisterSkillInput,
  ReputationEventDto,
  ResolveDisputeInput,
  ResolveTaskInput,
  SettlementEventDto,
  SiwsVerifyDto,
  SiwsVerifyInput,
  SkillDto,
  SubmitManifestInput,
  SubmitResultInput,
  TaskDetailDto,
  TaskDetailFullDto,
  TaskDto,
  TaskGraphDto,
  TaskResultDto,
  DeliveryManifestDto,
} from "./types";

export type OmniClawClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  actor?: ActorHeaders;
  siwsHeaders?: Record<string, string>;
};

export class OmniClawClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly actor?: ActorHeaders;
  private readonly siwsHeaders: Record<string, string>;

  constructor(options: OmniClawClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.actor = options.actor;
    this.siwsHeaders = options.siwsHeaders ?? {};
  }

  withActor(actor: ActorHeaders): OmniClawClient {
    return new OmniClawClient({ baseUrl: this.baseUrl, fetch: this.fetchImpl, actor, siwsHeaders: this.siwsHeaders });
  }

  withSiwsHeaders(headers: Record<string, string>): OmniClawClient {
    return new OmniClawClient({ baseUrl: this.baseUrl, fetch: this.fetchImpl, actor: this.actor, siwsHeaders: headers });
  }

  getHealth(): Promise<HealthDto> {
    return this.request("GET", "/health");
  }

  registerAgent(input: RegisterAgentInput, actor?: ActorHeaders): Promise<AgentDto> {
    return this.request("POST", "/agents", input, actor);
  }

  getAgent(agentId: string, actor?: ActorHeaders): Promise<AgentDto> {
    return this.request("GET", `/agents/${encodeURIComponent(agentId)}`, undefined, actor);
  }

  registerSkill(agentId: string, input: RegisterSkillInput, actor?: ActorHeaders): Promise<SkillDto> {
    return this.request("POST", `/agents/${encodeURIComponent(agentId)}/skills`, input, actor);
  }

  listAgentSkills(agentId: string, actor?: ActorHeaders): Promise<{ skills: SkillDto[] }> {
    return this.request("GET", `/agents/${encodeURIComponent(agentId)}/skills`, undefined, actor);
  }

  discoverAgents(filters: DiscoverAgentsFilters = {}, actor?: ActorHeaders): Promise<{ results: DiscoveryResultDto[] }> {
    return this.request("GET", `/agents/discover${query(filters)}`, undefined, actor);
  }

  createTask(input: CreateTaskInput, actor?: ActorHeaders): Promise<TaskDto> {
    return this.request("POST", "/tasks", input, actor);
  }

  listTasks(filters: ListTasksFilters = {}, actor?: ActorHeaders): Promise<{ tasks: TaskDto[] }> {
    return this.request("GET", `/tasks${query(filters)}`, undefined, actor);
  }

  getTaskDetail(taskId: string, actor?: ActorHeaders): Promise<TaskDetailDto> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}`, undefined, actor);
  }

  acceptTask(taskId: string, actor?: ActorHeaders): Promise<TaskDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/accept`, {}, actor);
  }

  rejectTask(taskId: string, actor?: ActorHeaders): Promise<TaskDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/reject`, {}, actor);
  }

  submitResult(taskId: string, input: SubmitResultInput, actor?: ActorHeaders): Promise<TaskResultDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/result`, input, actor);
  }

  resolveTask(taskId: string, input: ResolveTaskInput, actor?: ActorHeaders): Promise<TaskDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/resolve`, input, actor);
  }

  expireTask(taskId: string, actor?: ActorHeaders): Promise<TaskDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/expire`, {}, actor);
  }

  getTaskGraph(taskId: string, actor?: ActorHeaders): Promise<TaskGraphDto> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}/graph`, undefined, actor);
  }

  listSettlementEvents(filters: Pick<EventFilters, "task_id"> = {}, actor?: ActorHeaders): Promise<{ settlement_events: SettlementEventDto[] }> {
    return this.request("GET", `/settlement-events${query(filters)}`, undefined, actor);
  }

  listReputationEvents(filters: EventFilters = {}, actor?: ActorHeaders): Promise<{ reputation_events: ReputationEventDto[] }> {
    return this.request("GET", `/reputation-events${query(filters)}`, undefined, actor);
  }

  getTaskDetailFull(taskId: string, actor?: ActorHeaders): Promise<TaskDetailFullDto> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}/detail`, undefined, actor);
  }

  submitManifest(taskId: string, input: SubmitManifestInput, actor?: ActorHeaders): Promise<DeliveryManifestDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/manifest`, input, actor);
  }

  getManifest(taskId: string, actor?: ActorHeaders): Promise<DeliveryManifestDto | null> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}/manifest`, undefined, actor);
  }

  verifyTask(taskId: string, actor?: ActorHeaders): Promise<{ status: string; exit_code: number | null; stdout: string | null }> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/verify`, {}, actor);
  }

  getTaskProof(taskId: string, actor?: ActorHeaders): Promise<TaskDetailFullDto["proof"]> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}/proof`, undefined, actor);
  }

  listArtifactChecks(taskId: string, actor?: ActorHeaders): Promise<{ artifact_checks: ArtifactCheckDto[] }> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}/artifact-checks`, undefined, actor);
  }

  openDispute(taskId: string, input: OpenDisputeInput, actor?: ActorHeaders): Promise<DisputeDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/disputes`, input, actor);
  }

  resolveDispute(disputeId: string, input: ResolveDisputeInput, actor?: ActorHeaders): Promise<DisputeDto> {
    return this.request("POST", `/disputes/${encodeURIComponent(disputeId)}/resolve`, input, actor);
  }

  listDisputes(filters: { task_id?: string; status?: string } = {}, actor?: ActorHeaders): Promise<{ disputes: DisputeDto[] }> {
    return this.request("GET", `/disputes${query(filters)}`, undefined, actor);
  }

  getOperatorSettlementFailures(actor?: ActorHeaders): Promise<{ failures: OperatorSettlementFailureDto[] }> {
    return this.request("GET", `/operator/settlement-failures`, undefined, actor);
  }

  retrySettlementEvent(eventId: string, actor?: ActorHeaders): Promise<{ success: boolean }> {
    return this.request("POST", `/operator/settlement-events/${encodeURIComponent(eventId)}/retry`, {}, actor);
  }

  getOperatorAgentSuspensions(actor?: ActorHeaders): Promise<{ agents: OperatorAgentSuspensionDto[] }> {
    return this.request("GET", `/operator/agent-suspensions`, undefined, actor);
  }

  suspendAgent(agentId: string, actor?: ActorHeaders): Promise<AgentDto> {
    return this.request("POST", `/operator/agents/${encodeURIComponent(agentId)}/suspend`, {}, actor);
  }

  getExecutionQueue(filters: { task_id?: string; status?: string } = {}, actor?: ActorHeaders): Promise<{ queue: ExecutionQueueItemDto[] }> {
    return this.request("GET", `/operator/execution-queue${query(filters)}`, undefined, actor);
  }

  getNonce(address: string): Promise<NonceDto> {
    return this.request("GET", `/auth/nonce?address=${encodeURIComponent(address)}`);
  }

  verifySiws(input: SiwsVerifyInput): Promise<SiwsVerifyDto> {
    return this.request("POST", `/auth/verify`, input);
  }

  private async request<T>(method: string, path: string, body?: unknown, actor?: ActorHeaders): Promise<T> {
    const headers = new Headers(actorHeaders(actor ?? this.actor));
    for (const [key, value] of Object.entries(this.siwsHeaders)) {
      headers.set(key, value);
    }
    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await readJson(response);
    if (!response.ok) {
      if (isErrorEnvelope(data)) {
        throw OmniClawApiError.fromEnvelope(response.status, data);
      }
      throw new OmniClawApiError(response.status, "HTTP_ERROR", response.statusText, data, path);
    }
    return data as T;
  }
}

export const createOmniClawClient = (options: OmniClawClientOptions): OmniClawClient => new OmniClawClient(options);

const actorHeaders = (actor?: ActorHeaders): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (actor?.wallet) {
    headers["x-wallet"] = actor.wallet;
  }
  if (actor?.agentId) {
    headers["x-agent-id"] = actor.agentId;
  }
  if (actor?.role) {
    headers["x-role"] = actor.role;
  }
  return headers;
};

const query = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    search.set(key, value === null ? "null" : String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
};

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text.length === 0 ? null : JSON.parse(text);
};

const isErrorEnvelope = (value: unknown): value is OmniClawApiErrorEnvelope =>
  typeof value === "object" &&
  value !== null &&
  "error" in value &&
  typeof (value as { error?: unknown }).error === "object" &&
  (value as { error: { code?: unknown } }).error.code !== undefined;
