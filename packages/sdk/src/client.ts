import { OmniClawApiError } from "./errors";
import type {
  ActorHeaders,
  AgentDto,
  CreateTaskInput,
  DiscoverAgentsFilters,
  DiscoveryResultDto,
  EventFilters,
  ListTasksFilters,
  OmniClawApiErrorEnvelope,
  RegisterAgentInput,
  RegisterSkillInput,
  ReputationEventDto,
  ResolveTaskInput,
  SettlementEventDto,
  SkillDto,
  SubmitResultInput,
  TaskDetailDto,
  TaskDto,
  TaskGraphDto,
  TaskResultDto,
} from "./types";

export type OmniClawClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  actor?: ActorHeaders;
};

export class OmniClawClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly actor?: ActorHeaders;

  constructor(options: OmniClawClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.actor = options.actor;
  }

  withActor(actor: ActorHeaders): OmniClawClient {
    return new OmniClawClient({ baseUrl: this.baseUrl, fetch: this.fetchImpl, actor });
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

  private async request<T>(method: string, path: string, body?: unknown, actor?: ActorHeaders): Promise<T> {
    const headers = new Headers(actorHeaders(actor ?? this.actor));
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
