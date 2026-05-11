import { OmniClawApiError } from "./errors";
import type {
  ActorHeaders,
  AgentDto,
  BidDto,
  CreateBidInput,
  CreateTaskInput,
  DiscoverAgentsFilters,
  DiscoveryResultDto,
  EventFilters,
  ListTasksFilters,
  OmniClawApiErrorEnvelope,
  ProductCapabilitiesDto,
  ProfileDto,
  RegisterAgentInput,
  RegisterSkillInput,
  ReputationEventDto,
  ResolveTaskInput,
  SettlementEventDto,
  SolanaContractInfoDto,
  SkillDto,
  SkillCredentialDto,
  StakeEventDto,
  SubmitResultInput,
  TaskDetailDto,
  TaskDto,
  TaskGraphDto,
  TaskResultDto,
  TokenAccountDto,
  TokenTransferDto,
  RuntimeStatusDto,
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
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
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

  createBid(taskId: string, input: CreateBidInput, actor?: ActorHeaders): Promise<BidDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/bids`, input, actor);
  }

  listBids(taskId: string, actor?: ActorHeaders): Promise<{ bids: BidDto[] }> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}/bids`, undefined, actor);
  }

  acceptBid(taskId: string, bidId: string, actor?: ActorHeaders): Promise<BidDto> {
    return this.request("POST", `/tasks/${encodeURIComponent(taskId)}/bids/${encodeURIComponent(bidId)}/accept`, {}, actor);
  }

  getTaskGraph(taskId: string, actor?: ActorHeaders): Promise<TaskGraphDto> {
    return this.request("GET", `/tasks/${encodeURIComponent(taskId)}/graph`, undefined, actor);
  }

  listSettlementEvents(filters: Pick<EventFilters, "task_id"> = {}, actor?: ActorHeaders): Promise<{ settlement_events: SettlementEventDto[] }> {
    return this.request("GET", `/settlement-events${query(filters)}`, undefined, actor);
  }

  getSolanaContractInfo(actor?: ActorHeaders): Promise<SolanaContractInfoDto> {
    return this.request("GET", "/settlement/solana", undefined, actor);
  }

  getRuntimeStatus(actor?: ActorHeaders): Promise<RuntimeStatusDto> {
    return this.request("GET", "/runtime/status", undefined, actor);
  }

  getProductCapabilities(actor?: ActorHeaders): Promise<ProductCapabilitiesDto> {
    return this.request("GET", "/product/capabilities", undefined, actor);
  }

  listReputationEvents(filters: EventFilters = {}, actor?: ActorHeaders): Promise<{ reputation_events: ReputationEventDto[] }> {
    return this.request("GET", `/reputation-events${query(filters)}`, undefined, actor);
  }

  stakeAgent(agentId: string, amount_lamports: string, actor?: ActorHeaders): Promise<{ agent: AgentDto; stake_event: StakeEventDto }> {
    return this.request("POST", `/agents/${encodeURIComponent(agentId)}/stake`, { amount_lamports }, actor);
  }

  unstakeAgent(agentId: string, amount_lamports: string, actor?: ActorHeaders): Promise<{ agent: AgentDto; stake_event: StakeEventDto }> {
    return this.request("POST", `/agents/${encodeURIComponent(agentId)}/unstake`, { amount_lamports }, actor);
  }

  listStakeEvents(agentId: string, actor?: ActorHeaders): Promise<{ stake_events: StakeEventDto[] }> {
    return this.request("GET", `/agents/${encodeURIComponent(agentId)}/stake-events`, undefined, actor);
  }

  mintSkillCredential(skillId: string, input: Partial<Pick<SkillCredentialDto, "name" | "rarity" | "metadata">> = {}, actor?: ActorHeaders): Promise<SkillCredentialDto> {
    return this.request("POST", `/skills/${encodeURIComponent(skillId)}/credentials`, input, actor);
  }

  listSkillCredentials(skillId: string, actor?: ActorHeaders): Promise<{ credentials: SkillCredentialDto[] }> {
    return this.request("GET", `/skills/${encodeURIComponent(skillId)}/credentials`, undefined, actor);
  }

  listAgentCredentials(agentId: string, actor?: ActorHeaders): Promise<{ credentials: SkillCredentialDto[] }> {
    return this.request("GET", `/agents/${encodeURIComponent(agentId)}/credentials`, undefined, actor);
  }

  creditToken(wallet: string, input: { symbol: string; amount_lamports: string; task_id?: string | null }, actor?: ActorHeaders): Promise<{ account: TokenAccountDto; transfer: TokenTransferDto }> {
    return this.request("POST", `/wallets/${encodeURIComponent(wallet)}/tokens/credit`, input, actor);
  }

  swapToken(wallet: string, input: { from_symbol: string; to_symbol: string; amount_lamports: string }, actor?: ActorHeaders): Promise<{ debited: TokenAccountDto; credited: TokenAccountDto; transfer: TokenTransferDto }> {
    return this.request("POST", `/wallets/${encodeURIComponent(wallet)}/tokens/swap`, input, actor);
  }

  listWalletTokens(wallet: string, actor?: ActorHeaders): Promise<{ accounts: TokenAccountDto[]; transfers: TokenTransferDto[] }> {
    return this.request("GET", `/wallets/${encodeURIComponent(wallet)}/tokens`, undefined, actor);
  }

  getProfile(wallet: string, actor?: ActorHeaders): Promise<ProfileDto> {
    return this.request("GET", `/profiles/${encodeURIComponent(wallet)}`, undefined, actor);
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
