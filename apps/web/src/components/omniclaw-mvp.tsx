"use client";

import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  BookOpenCheck,
  Circle,
  CircleDot,
  Coins,
  GitBranch,
  Layers3,
  Network,
  Pause,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  UserCircle,
  WalletCards,
  Zap,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createOmniClawClient,
  OmniClawApiError,
  type ActorHeaders,
  type AgentDto,
  type AgentStatus,
  type BidDto,
  type DiscoverAgentsFilters,
  type DiscoveryResultDto,
  type ListTasksFilters,
  type ProductCapabilitiesDto,
  type ReputationEventDto,
  type RuntimeStatusDto,
  type SettlementEventDto,
  type SolanaContractInfoDto,
  type TaskDetailDto,
  type TaskDto,
  type TaskGraphDto,
  type TaskStatus,
  type ProfileDto,
  type SkillCredentialDto,
  type StakeEventDto,
  type TokenTransferDto,
} from "@omniclaw/sdk";

type OmniClawMvpProps = {
  client?: ReturnType<typeof createOmniClawClient>;
};

type ApiIssue = {
  status?: number;
  code: string;
  message: string;
  path?: string;
  details?: unknown;
};

type ViewMode = "all" | "network" | "lifecycle" | "market" | "lineage";
type EventItem = {
  id: string;
  taskId: string;
  kind: "settlement" | "reputation";
  label: string;
  value: string;
  tone: StatusTone;
  timestamp: string;
};
type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
type DemoScenario = {
  slug: string;
  label: string;
  coordinatorName: string;
  mission: string;
  accent: StatusTone;
  specialists: Array<{
    name: string;
    capability: string;
    brief: string;
  }>;
};
type PrototypeActivation = {
  bid: BidDto;
  stake: StakeEventDto;
  credential: SkillCredentialDto;
  swap: TokenTransferDto;
  profile: ProfileDto;
};
type DraftTask = {
  hirerAgentId: string;
  workerAgentId: string;
  skillId: string;
  paymentLamports: string;
  payloadJson: string;
  deadlineMinutes: string;
};

const API_URL = process.env.NEXT_PUBLIC_OMNICLAW_API_URL ?? "http://localhost:3000";
const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "network", label: "Network" },
  { value: "lifecycle", label: "Lifecycle" },
  { value: "market", label: "Market" },
  { value: "lineage", label: "Lineage" },
];
const STATUS_META: Record<TaskStatus | AgentStatus, { label: string; tone: StatusTone; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  active: { label: "active", tone: "success", icon: CircleDot },
  paused: { label: "paused", tone: "warning", icon: Pause },
  suspended: { label: "suspended", tone: "danger", icon: AlertTriangle },
  created: { label: "created", tone: "neutral", icon: Circle },
  escrow_locked: { label: "escrow locked", tone: "info", icon: ShieldCheck },
  accepted: { label: "accepted", tone: "info", icon: CircleDot },
  in_progress: { label: "in progress", tone: "warning", icon: Activity },
  submitted: { label: "submitted", tone: "warning", icon: Zap },
  completed: { label: "completed", tone: "success", icon: ShieldCheck },
  failed: { label: "failed", tone: "danger", icon: AlertTriangle },
  expired: { label: "expired", tone: "danger", icon: Timer },
  disputed: { label: "disputed", tone: "warning", icon: AlertTriangle },
  cancelled: { label: "cancelled", tone: "danger", icon: Circle },
};

const LIFECYCLE: TaskStatus[] = ["created", "escrow_locked", "accepted", "in_progress", "submitted", "completed"];
const TASK_FILTER_STATUSES: TaskStatus[] = [...LIFECYCLE, "failed", "expired", "disputed", "cancelled"];
const DEMO_SCENARIOS: DemoScenario[] = [
  {
    slug: "trading",
    label: "Trading Network",
    coordinatorName: "Trading Agent",
    mission: "Produce an execution-ready BTC trade plan",
    accent: "success",
    specialists: [
      { name: "Twitter Scraper Agent", capability: "twitter_scraping", brief: "Collect social posts and sentiment signals" },
      { name: "Onchain Analysis Agent", capability: "onchain_analysis", brief: "Analyze wallet flows and exchange movement" },
      { name: "Risk Management Agent", capability: "risk_management", brief: "Size exposure and define invalidation levels" },
    ],
  },
  {
    slug: "marketing",
    label: "Marketing Swarm",
    coordinatorName: "Marketing Agent",
    mission: "Launch a multilingual product campaign",
    accent: "info",
    specialists: [
      { name: "SEO Agent", capability: "seo_strategy", brief: "Build keyword clusters and ranking plan" },
      { name: "Copywriting Agent", capability: "copywriting", brief: "Write campaign landing and ad copy" },
      { name: "Video Editing Agent", capability: "video_editing", brief: "Create short-form video production notes" },
      { name: "Translation Agent", capability: "translation", brief: "Localize campaign copy" },
    ],
  },
  {
    slug: "founder",
    label: "Founder Stack",
    coordinatorName: "Founder Agent",
    mission: "Ship a crypto startup MVP and growth loop",
    accent: "warning",
    specialists: [
      { name: "UI Agent", capability: "ui_design", brief: "Design investor-ready product UX" },
      { name: "Solidity Agent", capability: "solidity_development", brief: "Implement smart-contract primitives" },
      { name: "Growth Agent", capability: "growth_strategy", brief: "Design activation and distribution experiments" },
    ],
  },
];
export function OmniClawMvp({ client: injectedClient }: OmniClawMvpProps) {
  const client = useMemo(() => injectedClient ?? createOmniClawClient({ baseUrl: API_URL }), [injectedClient]);
  const [filters, setFilters] = useState<DiscoverAgentsFilters>({ capability: "market_research", status: "active" });
  const [taskFilters, setTaskFilters] = useState<ListTasksFilters>({});
  const [results, setResults] = useState<DiscoveryResultDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [detail, setDetail] = useState<TaskDetailDto | null>(null);
  const [graph, setGraph] = useState<TaskGraphDto | null>(null);
  const [contractInfo, setContractInfo] = useState<SolanaContractInfoDto | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusDto | null>(null);
  const [productCapabilities, setProductCapabilities] = useState<ProductCapabilitiesDto | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [draftTask, setDraftTask] = useState<DraftTask>({
    hirerAgentId: "",
    workerAgentId: "",
    skillId: "",
    paymentLamports: "50000000",
    payloadJson: "{\n  \"topic\": \"Evaluate OmniClaw marketplace readiness\"\n}",
    deadlineMinutes: "60",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [issue, setIssue] = useState<ApiIssue | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prototypeActivation, setPrototypeActivation] = useState<PrototypeActivation | null>(null);

  const activeActor = useMemo<ActorHeaders>(() => ({ wallet: "wallet_operator" }), []);

  const run = useCallback(async <T,>(label: string, action: () => Promise<T>) => {
    setBusy(label);
    setIssue(null);
    try {
      return await action();
    } catch (error) {
      setIssue(toIssue(error));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const loadTask = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    const response = await run("detail", () => client.getTaskDetail(taskId, activeActor));
    if (response) {
      setDetail(response);
      const nextGraph = await run("graph", () => client.getTaskGraph(taskId, activeActor));
      if (nextGraph) {
        setGraph(nextGraph);
      }
    }
  }, [activeActor, client, run]);

  const runDemoScenario = useCallback(async (scenario: DemoScenario) => {
    const result = await run(`demo:${scenario.slug}`, async () => {
      const network = await createDelegationNetwork(client, scenario);
      const parent = await client.createTask({
        hirer_agent_id: network.sponsor.agent_id,
        worker_agent_id: network.coordinator.agent_id,
        skill_id: network.coordinatorSkill.skill_id,
        task_payload: {
          mission: scenario.mission,
          runtime_submit_result: false,
        },
        payment_lamports: "90000000",
        deadline: futureIso(90),
      }, { agentId: network.sponsor.agent_id });
      await client.acceptTask(parent.task_id, { agentId: network.coordinator.agent_id });

      const childTasks: TaskDto[] = [];
      for (const specialist of scenario.specialists) {
        const discovered = await client.discoverAgents({
          capability: specialist.capability,
          reputation_gt: 70,
          status: "active",
        });
        const match = discovered.results.find((candidate) => candidate.agent.agent_id === network.specialists[specialist.capability]?.agent.agent_id) ?? discovered.results[0];
        if (!match) {
          throw new Error(`No active agent found for ${specialist.capability}`);
        }
        const child = await client.createTask({
          parent_task_id: parent.task_id,
          hirer_agent_id: network.coordinator.agent_id,
          worker_agent_id: match.agent.agent_id,
          skill_id: match.skill.skill_id,
          task_payload: {
            capability: specialist.capability,
            brief: specialist.brief,
            parent_mission: scenario.mission,
          },
          payment_lamports: match.skill.base_price_lamports,
          deadline: parent.deadline,
        }, { agentId: network.coordinator.agent_id });
        await client.acceptTask(child.task_id, { agentId: match.agent.agent_id });
        await client.submitResult(child.task_id, {
          result_payload: {
            ok: true,
            worker_agent_id: match.agent.agent_id,
            delivered_for: specialist.capability,
          },
          artifacts: [{ kind: "capability_output", capability: specialist.capability }],
        }, { agentId: match.agent.agent_id });
        await client.resolveTask(child.task_id, { resolution: "completed", quality_score: 92, review_score: 5 }, { agentId: network.coordinator.agent_id });
        childTasks.push(child);
      }

      await client.submitResult(parent.task_id, {
        result_payload: {
          ok: true,
          scenario: scenario.slug,
          hired_capabilities: scenario.specialists.map((specialist) => specialist.capability),
          child_task_ids: childTasks.map((task) => task.task_id),
        },
        artifacts: childTasks.map((task) => ({ kind: "child_task", task_id: task.task_id })),
      }, { agentId: network.coordinator.agent_id });
      await client.resolveTask(parent.task_id, { resolution: "completed", quality_score: 95, review_score: 5 }, { agentId: network.sponsor.agent_id });
      const parentDetail = await client.getTaskDetail(parent.task_id);
      return { parent: parentDetail.task, network };
    });

    if (result) {
      setFilters({ capability: "", status: "active" });
      setTaskFilters({ parent_task_id: result.parent.task_id });
      const taskList = await run("tasks", () => client.listTasks({ parent_task_id: result.parent.task_id }, activeActor));
      const scenarioResults = demoDiscoveryResults(result.network);
      setResults(scenarioResults);
      if (taskList) {
        setTasks([result.parent, ...taskList.tasks]);
      }
      await loadTask(result.parent.task_id);
      setViewMode("lineage");
      setNotice(`${scenario.label} hired ${scenario.specialists.length} specialist agents through live SDK/API calls`);
    }
  }, [activeActor, client, loadTask, run]);

  const runPrototypeActivation = useCallback(async () => {
    const result = await run("prototype", async (): Promise<PrototypeActivation> => {
      const scenario = DEMO_SCENARIOS[0];
      const network = await createDelegationNetwork(client, scenario);
      const parent = await client.createTask({
        hirer_agent_id: network.sponsor.agent_id,
        worker_agent_id: network.coordinator.agent_id,
        skill_id: network.coordinatorSkill.skill_id,
        task_payload: { mission: "Activate prototype feature set", runtime_submit_result: false },
        payment_lamports: "70000000",
        deadline: futureIso(75),
      }, { agentId: network.sponsor.agent_id });
      const firstSpecialist = scenario.specialists[0];
      const specialist = network.specialists[firstSpecialist.capability];
      const bid = await client.createBid(parent.task_id, {
        bidder_agent_id: specialist.agent.agent_id,
        skill_id: specialist.skill.skill_id,
        price_lamports: specialist.skill.base_price_lamports,
        message: firstSpecialist.brief,
      }, { agentId: specialist.agent.agent_id, wallet: specialist.agent.publisher_wallet });
      const acceptedBid = await client.acceptBid(parent.task_id, bid.bid_id, { agentId: network.sponsor.agent_id });
      const stakeResult = await client.stakeAgent(network.coordinator.agent_id, "25000000", { wallet: network.coordinator.publisher_wallet });
      const credential = await client.mintSkillCredential(specialist.skill.skill_id, {
        name: `${specialist.skill.name} Skill Credential`,
        metadata: { source: "prototype activation", capability: firstSpecialist.capability },
      }, { wallet: specialist.agent.publisher_wallet });
      await client.creditToken(network.sponsor.publisher_wallet, { symbol: "SOL", amount_lamports: "100000000" }, { wallet: network.sponsor.publisher_wallet });
      const swap = await client.swapToken(network.sponsor.publisher_wallet, { from_symbol: "SOL", to_symbol: "USDC", amount_lamports: "25000000" }, { wallet: network.sponsor.publisher_wallet });
      const profile = await client.getProfile(network.sponsor.publisher_wallet);
      return { bid: acceptedBid, stake: stakeResult.stake_event, credential, swap: swap.transfer, profile };
    });
    if (result) {
      setPrototypeActivation(result);
      setNotice(`Prototype feature set activated: bid ${result.bid.status}, stake ${formatLamports(result.stake.resulting_stake_lamports)}, credential ${result.credential.rarity}, ${result.profile.token_transfers.length} wallet transfers`);
    }
  }, [client, run]);

  const refreshData = useCallback(async () => {
    const [discovery, taskList, solanaInfo, runtimeInfo, capabilities] = await Promise.all([
      run("discovery", () => client.discoverAgents(cleanFilters(filters), activeActor)),
      run("tasks", () => client.listTasks(cleanTaskFilters(taskFilters), activeActor)),
      run("solana", () => client.getSolanaContractInfo(activeActor)),
      run("runtime", () => client.getRuntimeStatus(activeActor)),
      run("capabilities", () => client.getProductCapabilities(activeActor)),
    ]);
    if (discovery) {
      setResults(discovery.results);
    }
    if (solanaInfo) {
      setContractInfo(solanaInfo);
    }
    if (runtimeInfo) {
      setRuntimeStatus(runtimeInfo);
    }
    if (capabilities) {
      setProductCapabilities(capabilities);
    }
    if (taskList) {
      setTasks(taskList.tasks);
      const taskId = selectedTaskId ?? taskList.tasks[0]?.task_id ?? null;
      if (taskId) {
        await loadTask(taskId);
      } else {
        setDetail(null);
        setGraph(null);
      }
      setNotice(`Visualized ${discovery?.results.length ?? results.length} agents and ${taskList.tasks.length} tasks`);
    }
  }, [activeActor, client, filters, loadTask, results.length, run, selectedTaskId, taskFilters]);

  const createDraftTask = useCallback(async () => {
    const result = await run("create-task", async () => {
      const payload = parseDraftJson(draftTask.payloadJson);
      const discoveredWorkerId = results.find((item) => item.skill.skill_id === draftTask.skillId)?.agent.agent_id;
      const workerAgentId = draftTask.workerAgentId || discoveredWorkerId;
      if (!workerAgentId) {
        throw new Error("worker_agent_id is required");
      }
      return await client.createTask({
        hirer_agent_id: draftTask.hirerAgentId,
        worker_agent_id: workerAgentId,
        skill_id: draftTask.skillId,
        task_payload: payload,
        payment_lamports: draftTask.paymentLamports,
        deadline: futureIso(Number(draftTask.deadlineMinutes) || 60),
      }, { agentId: draftTask.hirerAgentId });
    });
    if (result) {
      setSelectedTaskId(result.task_id);
      setTaskFilters({});
      await refreshData();
      await loadTask(result.task_id);
      setNotice(`Task ${result.task_id} created and escrow locked through SDK/API`);
    }
  }, [client, draftTask, loadTask, refreshData, results, run]);

  useEffect(() => {
    void refreshData();
  }, []);

  const agents = useMemo(() => uniqueAgents(results), [results]);
  const events = useMemo(() => collectEvents(detail), [detail]);
  const market = useMemo(() => buildMarketSignals(results, tasks), [results, tasks]);
  const activeTask = detail?.task ?? tasks.find((task) => task.task_id === selectedTaskId) ?? null;
  const flow = useMemo(() => buildFlow(agents, results, tasks, graph, selectedTaskId, viewMode), [agents, graph, results, selectedTaskId, tasks, viewMode]);
  const selectedResult = useMemo(() => results.find((result) => result.skill.skill_id === draftTask.skillId), [draftTask.skillId, results]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"><Sparkles size={14} /> OmniClaw live delegation</div>
            <h1 className="mt-1 text-xl font-semibold">Autonomous agent hiring graph</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={refreshData} busy={busy === "discovery" || busy === "tasks"} icon={<RefreshCw size={16} />}>Refresh</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-[calc(100vh-112px)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--canvas)]">
          <div className="border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <div className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  <Coins size={13} /> SDK demo flows
                </div>
                <h2 className="text-base font-semibold">Create a live delegation graph, then inspect the selected task.</h2>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {DEMO_SCENARIOS.map((scenario) => (
                  <Button
                    key={scenario.slug}
                    variant="secondary"
                    onClick={() => void runDemoScenario(scenario)}
                    busy={busy === `demo:${scenario.slug}`}
                    icon={<Rocket size={16} style={{ color: toneColor(scenario.accent) }} />}
                  >
                    {scenario.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <ControlDeck
            filters={filters}
            taskFilters={taskFilters}
            draftTask={draftTask}
            results={results}
            selectedResult={selectedResult}
            busy={busy}
            onFiltersChange={setFilters}
            onTaskFiltersChange={setTaskFilters}
            onDraftTaskChange={setDraftTask}
            onRefresh={() => void refreshData()}
            onCreateTask={() => void createDraftTask()}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
            <SegmentedControl value={viewMode} onChange={setViewMode} />
            <div className="flex flex-wrap items-center gap-2">
              <Signal icon={<Network size={15} />} label="agents" value={String(agents.length)} />
              <Signal icon={<GitBranch size={15} />} label="tasks" value={String(tasks.length)} />
              <Signal icon={<ShieldCheck size={15} />} label="settlement" value={contractInfo?.settlement_mode ?? "mock"} />
              <Signal icon={<Activity size={15} />} label="runtime" value={runtimeStatus?.adapter_mode ?? "mock"} />
            </div>
          </div>

          {(issue || notice) && <Feedback issue={issue} notice={notice} />}

          <div className="h-[calc(100vh-252px)] min-h-[560px]">
            <div className="relative h-full">
              {flow.nodes.length > 0 ? (
                <ReactFlow
                  key={`${viewMode}:${graph?.rootTaskId ?? "market"}:${flow.nodes.length}:${flow.edges.length}`}
                  nodes={flow.nodes}
                  edges={flow.edges}
                  fitView
                  fitViewOptions={{ padding: 0.22 }}
                  onNodeClick={(_, node) => {
                    if (node.type === "task" || String(node.id).startsWith("task:")) {
                      void loadTask(String(node.id).replace(/^task:/, ""));
                    }
                  }}
                >
                  <Background color="var(--flow-grid)" gap={28} />
                  <MiniMap pannable zoomable nodeColor={(node) => node.data?.tone ? toneColor(String(node.data.tone) as StatusTone) : toneColor("neutral")} />
                  <Controls />
                </ReactFlow>
              ) : (
                <EmptyVisualization />
              )}
            </div>
          </div>
        </section>

        <aside className="grid gap-4">
          <ProtocolActions activation={prototypeActivation} busy={busy === "prototype"} onActivate={runPrototypeActivation} />
          <ProductReadiness capabilities={productCapabilities} />
          <ConsoleSummary market={market} contractInfo={contractInfo} runtimeStatus={runtimeStatus} capabilities={productCapabilities} />
          <Inspector task={activeTask} detail={detail} events={events} onSelectTask={loadTask} tasks={tasks} />
        </aside>
      </div>
    </main>
  );
}

function SegmentedControl({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--background)] p-1" aria-label="visualization view">
      {VIEW_MODES.map((mode) => (
        <button
          key={mode.value}
          className={`h-8 rounded px-3 text-sm font-medium transition-colors ${value === mode.value ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--foreground)]"}`}
          type="button"
          onClick={() => onChange(mode.value)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function ControlDeck({
  filters,
  taskFilters,
  draftTask,
  results,
  selectedResult,
  busy,
  onFiltersChange,
  onTaskFiltersChange,
  onDraftTaskChange,
  onRefresh,
  onCreateTask,
}: {
  filters: DiscoverAgentsFilters;
  taskFilters: ListTasksFilters;
  draftTask: DraftTask;
  results: DiscoveryResultDto[];
  selectedResult: DiscoveryResultDto | undefined;
  busy: string | null;
  onFiltersChange: (filters: DiscoverAgentsFilters) => void;
  onTaskFiltersChange: (filters: ListTasksFilters) => void;
  onDraftTaskChange: (draft: DraftTask) => void;
  onRefresh: () => void;
  onCreateTask: () => void;
}) {
  return (
    <div className="grid gap-3 border-b border-[var(--border)] bg-[var(--canvas)] px-4 py-3 lg:grid-cols-[1fr_1fr_1.2fr]">
      <section className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Marketplace filters</h2>
          <Search size={15} className="text-[var(--muted)]" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="capability">
            <Input value={String(filters.capability ?? "")} onChange={(event) => onFiltersChange({ ...filters, capability: event.target.value })} placeholder="market_research" />
          </Field>
          <Field label="status">
            <Select value={filters.status ?? ""} onChange={(event) => onFiltersChange({ ...filters, status: event.target.value as AgentStatus || undefined })}>
              <option value="">any</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="suspended">suspended</option>
            </Select>
          </Field>
          <Field label="reputation_gt">
            <Input value={String(filters.reputation_gt ?? "")} onChange={(event) => onFiltersChange({ ...filters, reputation_gt: event.target.value })} placeholder="80" />
          </Field>
          <Field label="max_price_lamports">
            <Input value={filters.max_price_lamports ?? ""} onChange={(event) => onFiltersChange({ ...filters, max_price_lamports: event.target.value })} placeholder="100000000" />
          </Field>
        </div>
        <Button className="mt-3 w-full" variant="secondary" onClick={onRefresh} busy={busy === "discovery"} icon={<RefreshCw size={16} />}>Apply filters</Button>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Task filters</h2>
          <GitBranch size={15} className="text-[var(--muted)]" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="worker_agent_id">
            <Input value={taskFilters.worker_agent_id ?? ""} onChange={(event) => onTaskFiltersChange({ ...taskFilters, worker_agent_id: event.target.value })} placeholder="agent_xxx" />
          </Field>
          <Field label="status">
            <Select value={taskFilters.status ?? ""} onChange={(event) => onTaskFiltersChange({ ...taskFilters, status: event.target.value as TaskStatus || undefined })}>
              <option value="">any</option>
              {TASK_FILTER_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </Select>
          </Field>
          <Field label="parent_task_id">
            <Input value={taskFilters.parent_task_id ?? ""} onChange={(event) => onTaskFiltersChange({ ...taskFilters, parent_task_id: event.target.value || undefined })} placeholder="task_xxx or null" />
          </Field>
          <Field label="deadline_from">
            <Input value={taskFilters.deadline_from ?? ""} onChange={(event) => onTaskFiltersChange({ ...taskFilters, deadline_from: event.target.value })} placeholder="ISO timestamp" />
          </Field>
        </div>
        <Button className="mt-3 w-full" variant="secondary" onClick={onRefresh} busy={busy === "tasks"} icon={<RefreshCw size={16} />}>Apply task filters</Button>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Create task</h2>
          <Rocket size={15} className="text-[var(--accent)]" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="hirer_agent_id">
            <Input value={draftTask.hirerAgentId} onChange={(event) => onDraftTaskChange({ ...draftTask, hirerAgentId: event.target.value })} placeholder="agent_hirer" />
          </Field>
          <Field label="create_worker_agent_id">
            <Input value={draftTask.workerAgentId} onChange={(event) => onDraftTaskChange({ ...draftTask, workerAgentId: event.target.value })} placeholder={selectedResult?.agent.agent_id ?? "agent_worker"} />
          </Field>
          <Field label="worker skill">
            <Select
              value={draftTask.skillId}
              onChange={(event) => {
                const result = results.find((item) => item.skill.skill_id === event.target.value);
                onDraftTaskChange({
                  ...draftTask,
                  skillId: event.target.value,
                  workerAgentId: result?.agent.agent_id ?? "",
                  paymentLamports: result?.skill.base_price_lamports ?? draftTask.paymentLamports,
                });
              }}
            >
              <option value="">select discovery result</option>
              {results.map((result) => <option key={result.skill.skill_id} value={result.skill.skill_id}>{result.agent.name} / {result.skill.name}</option>)}
            </Select>
          </Field>
          <Field label="payment_lamports">
            <Input value={draftTask.paymentLamports} onChange={(event) => onDraftTaskChange({ ...draftTask, paymentLamports: event.target.value })} />
          </Field>
          <Field label="deadline_minutes">
            <Input value={draftTask.deadlineMinutes} onChange={(event) => onDraftTaskChange({ ...draftTask, deadlineMinutes: event.target.value })} />
          </Field>
        </div>
        <Field label={`task_payload${selectedResult ? ` for ${selectedResult.skill.name}` : ""}`}>
          <Textarea value={draftTask.payloadJson} onChange={(event) => onDraftTaskChange({ ...draftTask, payloadJson: event.target.value })} />
        </Field>
        <Button className="mt-3 w-full" onClick={onCreateTask} busy={busy === "create-task"} icon={<ShieldCheck size={16} />}>Create escrow task</Button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
      {label}
      {children}
    </label>
  );
}

function Signal({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm">
      <span className="text-[var(--muted)]">{icon}</span>
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function ProtocolActions({ activation, busy, onActivate }: { activation: PrototypeActivation | null; busy: boolean; onActivate: () => void }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">protocol actions</div>
          <h2 className="mt-1 text-base font-semibold">Ledger and profile flow</h2>
        </div>
        <WalletCards size={17} className="text-[var(--accent)]" />
      </div>
      <div className="grid gap-3 p-4">
        <Button onClick={onActivate} busy={busy} icon={<Zap size={16} />}>
          Run ledger/profile flow
        </Button>
        <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
          Creates an API bid, stake event, token credit/swap, skill credential record, and wallet profile aggregation. Token and credential records are API ledger state, not live SPL transfers or Metaplex mints.
        </div>
        {activation ? (
          <div className="grid gap-2">
            <ActionRecord icon={<BadgeDollarSign size={15} />} label="bid" value={`${activation.bid.status} / ${formatLamports(activation.bid.price_lamports)}`} />
            <ActionRecord icon={<Layers3 size={15} />} label="stake" value={formatLamports(activation.stake.resulting_stake_lamports)} />
            <ActionRecord icon={<BookOpenCheck size={15} />} label="credential" value={`${activation.credential.name} / ${activation.credential.rarity}`} />
            <ActionRecord icon={<WalletCards size={15} />} label="swap" value={`${formatLamports(activation.swap.amount_lamports)} ${activation.swap.from_symbol} to ${activation.swap.to_symbol}`} />
            <ActionRecord icon={<UserCircle size={15} />} label="profile" value={`${activation.profile.agents.length} agents, ${activation.profile.token_transfers.length} transfers`} />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--muted)]">
            No ledger/profile action has been run in this session.
          </div>
        )}
      </div>
    </section>
  );
}

function ActionRecord({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_76px_1fr] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs">
      <span className="text-[var(--muted)]">{icon}</span>
      <span className="font-medium text-[var(--muted)]">{label}</span>
      <span className="break-all font-mono">{value}</span>
    </div>
  );
}

function Inspector({ task, detail, events, tasks, onSelectTask }: { task: TaskDto | null; detail: TaskDetailDto | null; events: EventItem[]; tasks: TaskDto[]; onSelectTask: (taskId: string) => void }) {
  return (
    <>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">selected task</div>
            <h2 className="mt-1 break-all text-sm font-semibold">{task ? task.task_id : "No active task"}</h2>
          </div>
          {task && <StatusBadge status={task.status} />}
        </div>
        {task ? (
          <div className="grid gap-3 p-4">
            <Metric label="hirer_agent_id" value={task.hirer_agent_id} />
            <Metric label="worker_agent_id" value={task.worker_agent_id} />
            <Metric label="skill_id" value={task.skill_id} />
            <Metric label="payment_lamports" value={formatLamports(task.payment_lamports)} />
            <Metric label="worker_payout_lamports" value={formatLamports(task.worker_payout_lamports)} />
            <Metric label="escrow_account" value={task.escrow_account ?? "none"} />
            <Metric label="deadline" value={formatDate(task.deadline)} />
          </div>
        ) : (
          <div className="p-4 text-sm text-[var(--muted)]">No protocol tasks are available for visualization.</div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Protocol event stream</h2>
          <Zap size={16} className="text-[var(--muted)]" />
        </div>
        <div className="max-h-[280px] overflow-auto p-4">
          {events.length > 0 ? (
            <div className="grid gap-2">
              {events.map((event) => <EventRow key={event.id} event={event} />)}
            </div>
          ) : (
            <div className="text-sm text-[var(--muted)]">Settlement and reputation events appear after a task is selected.</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Task index</h2>
          <Search size={16} className="text-[var(--muted)]" />
        </div>
        <div className="max-h-[260px] overflow-auto">
          {tasks.map((item) => (
            <button key={item.task_id} className="grid w-full grid-cols-[1fr_auto] gap-3 border-b border-[var(--border)] px-4 py-3 text-left text-sm hover:bg-[var(--selected)]" type="button" onClick={() => onSelectTask(item.task_id)}>
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs">{item.task_id}</span>
                <span className="block truncate text-xs text-[var(--muted)]">{item.worker_agent_id} / {formatLamports(item.payment_lamports)}</span>
              </span>
              <StatusBadge status={item.status} />
            </button>
          ))}
          {tasks.length === 0 && <div className="p-4 text-sm text-[var(--muted)]">No tasks match the current filters.</div>}
        </div>
      </section>
    </>
  );
}

function ProductReadiness({ capabilities }: { capabilities: ProductCapabilitiesDto | null }) {
  const items = capabilities?.capabilities ?? [];
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">product readiness</div>
          <h2 className="mt-1 text-base font-semibold">Capability map</h2>
        </div>
        <ShieldCheck size={17} className="text-[var(--accent)]" />
      </div>
      <div className="grid gap-2 p-4">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{item.label}</span>
              <CapabilityBadge status={item.status} />
            </div>
            <p className="text-xs leading-5 text-[var(--muted)]">{item.description}</p>
          </div>
        )) : (
          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--muted)]">
            Capability status loads from the API product boundary.
          </div>
        )}
      </div>
    </section>
  );
}

function ConsoleSummary({
  market,
  contractInfo,
  runtimeStatus,
  capabilities,
}: {
  market: ReturnType<typeof buildMarketSignals>;
  contractInfo: SolanaContractInfoDto | null;
  runtimeStatus: RuntimeStatusDto | null;
  capabilities: ProductCapabilitiesDto | null;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">console state</div>
          <h2 className="mt-1 text-base font-semibold">Protocol snapshot</h2>
        </div>
        <ActivityIcon />
      </div>
      <div className="grid gap-3 p-4">
        <Metric label="settlement_mode" value={contractInfo?.settlement_mode ?? "loading"} />
        <Metric label="runtime_adapter" value={runtimeStatus?.adapter_mode ?? "loading"} />
        <Metric label="runtime_provider" value={runtimeStatus?.provider ?? "loading"} />
        <Metric label="wallet_auth" value={capabilities?.boundaries.wallet_auth ?? "loading"} />
        <Metric label="total_payment_lamports" value={formatLamports(market.totalPayment)} />
        <Metric label="avg_reputation" value={market.avgReputation.toFixed(0)} />
      </div>
    </section>
  );
}

function CapabilityBadge({ status }: { status: ProductCapabilitiesDto["capabilities"][number]["status"] }) {
  const meta: Record<ProductCapabilitiesDto["capabilities"][number]["status"], { label: string; tone: StatusTone }> = {
    live_sdk_api: { label: "live SDK/API", tone: "success" },
    contract_ready: { label: "contract-ready", tone: "info" },
    api_ledger: { label: "API ledger", tone: "warning" },
    mocked_boundary: { label: "mocked", tone: "neutral" },
  };
  const item = meta[status];
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-xs font-medium" style={{ borderColor: toneColor(item.tone), color: toneColor(item.tone) }}>
      {item.label}
    </span>
  );
}

function ActivityIcon() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--selected)] text-[var(--accent)]">
      <Activity size={16} />
    </span>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className="break-all text-sm font-semibold">{value}</div>
    </div>
  );
}

function EventRow({ event }: { event: EventItem }) {
  return (
    <div className="grid grid-cols-[16px_1fr_auto] items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
      <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: toneColor(event.tone) }} />
      <span className="min-w-0">
        <span className="block font-medium">{event.label}</span>
        <span className="block truncate font-mono text-xs text-[var(--muted)]">{event.taskId}</span>
      </span>
      <span className="text-right">
        <span className="block font-mono text-xs">{event.value}</span>
        <span className="block text-xs text-[var(--muted)]">{formatDate(event.timestamp)}</span>
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus | AgentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium" style={{ borderColor: toneColor(meta.tone), color: toneColor(meta.tone) }}>
      <Icon size={13} />
      {meta.label}
    </span>
  );
}

function Feedback({ issue, notice }: { issue: ApiIssue | null; notice: string | null }) {
  if (issue) {
    return (
      <div role="alert" className="border-b border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> API error envelope</div>
        <div className="grid gap-1 font-mono text-xs">
          <span>code: {issue.code}</span>
          <span>message: {issue.message}</span>
          <span>path: {issue.path ?? "n/a"}</span>
          <span>details: {JSON.stringify(issue.details)}</span>
        </div>
      </div>
    );
  }
  return notice ? <div className="border-b border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm">{notice}</div> : null;
}

function EmptyVisualization() {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center p-8">
      <div className="max-w-[520px] text-center">
        <Network size={32} className="mx-auto mb-3 text-[var(--muted)]" />
        <h2 className="text-lg font-semibold">No agent graph to render</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Register agents and tasks through the API or SDK, then refresh this visualization.</p>
      </div>
    </div>
  );
}

function buildFlow(agents: AgentDto[], results: DiscoveryResultDto[], tasks: TaskDto[], graph: TaskGraphDto | null, selectedTaskId: string | null, viewMode: ViewMode): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const graphTasks = graph?.nodes.map((node) => ({
    task_id: node.taskId,
    parent_task_id: node.parentTaskId,
    worker_agent_id: node.workerAgentId,
    payment_lamports: node.paymentLamports,
    worker_payout_lamports: node.workerPayoutLamports,
    status: node.status,
    deadline: node.deadline,
  })) ?? tasks;
  const rootTaskId = graph?.rootTaskId ?? graphTasks.find((task) => task.parent_task_id === null)?.task_id ?? graphTasks[0]?.task_id ?? null;
  const childTasks = graphTasks.filter((task) => task.task_id !== rootTaskId);
  const agentById = new Map(agents.map((agent) => [agent.agent_id, agent]));
  const resultByAgentId = new Map(results.map((result) => [result.agent.agent_id, result]));
  const addNode = (node: Node) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id);
      nodes.push(node);
    }
  };
  const addEdge = (edge: Edge) => {
    if (!edgeIds.has(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };
  const taskPosition = (index: number, total: number, mode: ViewMode) => {
    if (index === 0) {
      return mode === "lineage" ? { x: 520, y: 120 } : { x: 520, y: 300 };
    }
    const spread = Math.min(780, Math.max(280, total * 230));
    return {
      x: 520 - spread / 2 + (index - 1) * (spread / Math.max(total - 1, 1)),
      y: mode === "lineage" ? 350 : 520,
    };
  };
  const addTaskLayer = (mode: ViewMode) => {
    const ordered = [...graphTasks].sort((a, b) => {
      if (a.task_id === rootTaskId) return -1;
      if (b.task_id === rootTaskId) return 1;
      return a.task_id.localeCompare(b.task_id);
    });
    ordered.forEach((task, index) => {
      addNode({
        id: `task:${task.task_id}`,
        type: "default",
        position: taskPosition(index, ordered.length, mode),
        data: {
          tone: STATUS_META[task.status].tone,
          label: <TaskNode task={task} selected={selectedTaskId === task.task_id} />,
        },
      });
    });
    const graphEdges = graph?.edges.map((edge) => ({ from: edge.from, to: edge.to })) ?? graphTasks.filter((task) => task.parent_task_id).map((task) => ({ from: task.parent_task_id as string, to: task.task_id }));
    graphEdges.forEach((edge) => addEdge({
      id: `task-edge:${edge.from}:${edge.to}`,
      source: `task:${edge.from}`,
      target: `task:${edge.to}`,
      animated: true,
    }));
  };
  const addNetworkLayer = (mode: ViewMode) => {
    const orderedResults = [...results].sort((a, b) => b.ranking.score - a.ranking.score);
    orderedResults.forEach((result, index) => {
      const isAll = mode === "all";
      const x = isAll ? 120 + (index % 2) * 260 : 180 + (index % 2) * 340;
      const y = isAll ? 120 + Math.floor(index / 2) * 150 : 120 + Math.floor(index / 2) * 190;
      addNode({
        id: `agent:${result.agent.agent_id}`,
        type: "default",
        position: { x, y },
        data: {
          tone: STATUS_META[result.agent.status].tone,
          label: <AgentNode agent={result.agent} />,
        },
      });
      addNode({
        id: `skill:${result.skill.skill_id}`,
        type: "default",
        position: { x: x + 320, y: y + 18 },
        data: {
          tone: "info",
          label: <SkillNode result={result} />,
        },
      });
      addEdge({
        id: `agent-skill:${result.agent.agent_id}:${result.skill.skill_id}`,
        source: `agent:${result.agent.agent_id}`,
        target: `skill:${result.skill.skill_id}`,
        animated: true,
      });
    });
  };
  const addMarketLayer = () => {
    [...results].sort((a, b) => b.ranking.score - a.ranking.score).forEach((result, index) => {
      const laneY = 100 + index * 145;
      addNode({
        id: `agent:${result.agent.agent_id}`,
        type: "default",
        position: { x: 120, y: laneY },
        data: { tone: STATUS_META[result.agent.status].tone, label: <AgentNode agent={result.agent} /> },
      });
      addNode({
        id: `skill:${result.skill.skill_id}`,
        type: "default",
        position: { x: 500 + result.ranking.score * 220, y: laneY + 10 },
        data: { tone: "info", label: <SkillNode result={result} /> },
      });
      addEdge({
        id: `market:${result.agent.agent_id}:${result.skill.skill_id}`,
        source: `agent:${result.agent.agent_id}`,
        target: `skill:${result.skill.skill_id}`,
        animated: index < 3,
      });
    });
  };
  const addLifecycleLayer = (y = 120) => {
    LIFECYCLE.forEach((status, index) => {
      addNode({
        id: `state:${status}`,
        type: "default",
        position: { x: 80 + index * 190, y },
        data: {
          tone: STATUS_META[status].tone,
          label: <StateNode status={status} />,
        },
      });
      if (index > 0) {
        addEdge({
          id: `state-edge:${LIFECYCLE[index - 1]}:${status}`,
          source: `state:${LIFECYCLE[index - 1]}`,
          target: `state:${status}`,
          animated: true,
        });
      }
    });
  };

  if (viewMode === "network") {
    addNetworkLayer("network");
  } else if (viewMode === "market") {
    addMarketLayer();
  } else if (viewMode === "lifecycle") {
    addLifecycleLayer();
  } else {
    addTaskLayer(viewMode);
    if (viewMode === "all") {
      addNetworkLayer("all");
      addLifecycleLayer(760);
      childTasks.forEach((task) => {
        const agent = agentById.get(task.worker_agent_id);
        const result = resultByAgentId.get(task.worker_agent_id);
        if (agent) {
          addEdge({
            id: `task-worker:${task.task_id}:${agent.agent_id}`,
            source: `agent:${agent.agent_id}`,
            target: `task:${task.task_id}`,
            animated: true,
          });
        }
        if (result) {
          addEdge({
            id: `skill-task:${result.skill.skill_id}:${task.task_id}`,
            source: `skill:${result.skill.skill_id}`,
            target: `task:${task.task_id}`,
            animated: false,
          });
        }
      });
    }
  }

  return { nodes, edges };
}

function AgentNode({ agent }: { agent: AgentDto }) {
  return (
    <div className="min-w-[210px] rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-left shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{agent.name}</div>
          <div className="font-mono text-xs text-[var(--muted)]">{agent.agent_id}</div>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <NodeStat label="rep" value={agent.reputation_score} />
        <NodeStat label="lat" value={`${agent.avg_latency_ms}ms`} />
        <NodeStat label="stake" value={compactLamports(agent.stake_amount)} />
      </div>
    </div>
  );
}

function SkillNode({ result }: { result: DiscoveryResultDto }) {
  return (
    <div className="min-w-[190px] rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-left shadow-sm">
      <div className="font-semibold">{result.skill.name}</div>
      <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{result.skill.description}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <NodeStat label="rank" value={result.ranking.score.toFixed(2)} />
        <NodeStat label="price" value={compactLamports(result.skill.base_price_lamports)} />
      </div>
    </div>
  );
}

function StateNode({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div className="grid min-w-[150px] justify-items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-center shadow-sm">
      <span style={{ color: toneColor(meta.tone) }}><Icon size={18} /></span>
      <div className="text-sm font-semibold">{meta.label}</div>
    </div>
  );
}

function TaskNode({ task, selected }: { task: Pick<TaskDto, "task_id" | "worker_agent_id" | "payment_lamports" | "worker_payout_lamports" | "status" | "deadline">; selected: boolean }) {
  return (
    <div className={`min-w-[230px] rounded-md border bg-[var(--background)] p-3 text-left shadow-sm ${selected ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-xs">{task.task_id}</span>
        <StatusBadge status={task.status} />
      </div>
      <div className="grid gap-1 text-xs text-[var(--muted)]">
        <div>worker: {task.worker_agent_id}</div>
        <div>payment: {formatLamports(task.payment_lamports)}</div>
        <div>payout: {formatLamports(task.worker_payout_lamports)}</div>
        <div>deadline: {formatDate(task.deadline)}</div>
      </div>
    </div>
  );
}

function NodeStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-[var(--panel)] px-2 py-1">
      <div className="text-[var(--muted)]">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}

function uniqueAgents(results: DiscoveryResultDto[]): AgentDto[] {
  const map = new Map<string, AgentDto>();
  for (const result of results) {
    map.set(result.agent.agent_id, result.agent);
  }
  return Array.from(map.values());
}

function collectEvents(detail: TaskDetailDto | null): EventItem[] {
  if (!detail) {
    return [];
  }
  const settlement = detail.settlement_events.map((event: SettlementEventDto): EventItem => ({
    id: event.event_id,
    taskId: event.task_id,
    kind: "settlement",
    label: event.event_type,
    value: formatLamports(event.amount_lamports),
    tone: event.event_type === "settlement_failed" ? "danger" : event.event_type === "worker_paid" ? "success" : "info",
    timestamp: event.created_at,
  }));
  const reputation = detail.reputation_events.map((event: ReputationEventDto): EventItem => ({
    id: event.event_id,
    taskId: event.task_id,
    kind: "reputation",
    label: event.success ? "reputation gained" : "reputation penalty",
    value: `${event.reputation_delta > 0 ? "+" : ""}${event.reputation_delta}`,
    tone: event.success ? "success" : "danger",
    timestamp: event.created_at,
  }));
  return [...settlement, ...reputation].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function buildMarketSignals(results: DiscoveryResultDto[], tasks: TaskDto[]) {
  const agents = uniqueAgents(results);
  const avgReputation = average(agents.map((agent) => agent.reputation_score));
  const avgQuality = average(agents.map((agent) => agent.quality_score));
  const avgSuccess = average(agents.map((agent) => agent.success_rate));
  const latencyPressure = clamp(average(results.map((result) => result.skill.estimated_latency_ms)) / 150, 0, 100);
  const totalPayment = tasks.reduce((sum, task) => sum + Number(task.payment_lamports), 0).toFixed(0);
  return { avgReputation, avgQuality, avgSuccess, latencyPressure, totalPayment };
}

function cleanFilters(filters: DiscoverAgentsFilters): DiscoverAgentsFilters {
  return {
    capability: filters.capability || undefined,
    status: filters.status || undefined,
    reputation_gt: filters.reputation_gt || undefined,
    latency_lt_ms: filters.latency_lt_ms || undefined,
    max_price_lamports: filters.max_price_lamports || undefined,
  };
}

function cleanTaskFilters(filters: ListTasksFilters): ListTasksFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== undefined)) as ListTasksFilters;
}

function demoDiscoveryResults(network: Awaited<ReturnType<typeof createDelegationNetwork>>): DiscoveryResultDto[] {
  const rows: Array<{ agent: AgentDto; skill: DiscoveryResultDto["skill"]; score: number }> = [
    { agent: network.coordinator, skill: network.coordinatorSkill, score: 1 },
    ...Object.values(network.specialists).map((specialist, index) => ({
      agent: specialist.agent,
      skill: specialist.skill,
      score: 0.96 - index * 0.03,
    })),
  ];
  return rows.map(({ agent, skill, score }) => ({
    agent,
    skill,
    ranking: {
      score,
      skillMatch: 1,
      reputation: agent.reputation_score / 100,
      successRate: agent.success_rate / 100,
      quality: agent.quality_score / 100,
      latency: Math.max(0, 1 - skill.estimated_latency_ms / 10_000),
      price: 1,
      stake: Number(agent.stake_amount) > 0 ? 1 : 0,
    },
  }));
}

function parseDraftJson(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("task_payload must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function createDelegationNetwork(client: ReturnType<typeof createOmniClawClient>, scenario: DemoScenario) {
  const runId = `${scenario.slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const sponsorWallet = `wallet_${runId}_sponsor`;
  const sponsor = await client.registerAgent({
    publisher_wallet: sponsorWallet,
    name: `${scenario.label} Sponsor`,
    description: `Funds ${scenario.coordinatorName}`,
    reputation_score: 91,
    success_rate: 96,
    quality_score: 93,
  }, { wallet: sponsorWallet });

  const coordinatorWallet = `wallet_${runId}_coordinator`;
  const coordinator = await client.registerAgent({
    publisher_wallet: coordinatorWallet,
    name: scenario.coordinatorName,
    description: `Coordinates specialist hiring for ${scenario.slug} missions`,
    reputation_score: 88,
    success_rate: 94,
    quality_score: 91,
    delegation_success_rate: 90,
    stake_amount: "50000000",
  }, { wallet: coordinatorWallet });
  const coordinatorSkill = await client.registerSkill(coordinator.agent_id, {
    name: `${scenario.slug}_coordination_${runId}`,
    description: `Plans, hires, and aggregates ${scenario.slug} specialist work`,
    input_schema: {
      type: "object",
      required: ["mission"],
      properties: {
        mission: { type: "string" },
        runtime_submit_result: { type: "boolean" },
      },
    },
    output_schema: {
      type: "object",
      required: ["ok", "scenario", "hired_capabilities", "child_task_ids"],
      properties: {
        ok: { type: "boolean" },
        scenario: { type: "string" },
        hired_capabilities: { type: "array" },
        child_task_ids: { type: "array" },
      },
    },
    base_price_lamports: "30000000",
    estimated_latency_ms: 1200,
    required_permissions: ["discover_agents", "create_child_tasks", "read_child_task_details"],
  }, { wallet: coordinatorWallet });

  const specialists: Record<string, { agent: AgentDto; skill: DiscoveryResultDto["skill"] }> = {};
  for (const [index, specialist] of scenario.specialists.entries()) {
    const wallet = `wallet_${runId}_${specialist.capability}`;
    const agent = await client.registerAgent({
      publisher_wallet: wallet,
      name: specialist.name,
      description: specialist.brief,
      reputation_score: 82 + index,
      success_rate: 89 + index,
      avg_latency_ms: 800 + index * 100,
      quality_score: 86 + index,
      stake_amount: `${20_000_000 + index * 1_000_000}`,
    }, { wallet });
    const skill = await client.registerSkill(agent.agent_id, {
      name: specialist.capability,
      description: specialist.brief,
      input_schema: {
        type: "object",
        required: ["capability", "brief", "parent_mission"],
        properties: {
          capability: { type: "string" },
          brief: { type: "string" },
          parent_mission: { type: "string" },
        },
      },
      output_schema: {
        type: "object",
        required: ["ok", "worker_agent_id", "delivered_for"],
        properties: {
          ok: { type: "boolean" },
          worker_agent_id: { type: "string" },
          delivered_for: { type: "string" },
        },
      },
      base_price_lamports: `${8_000_000 + index * 1_000_000}`,
      estimated_latency_ms: 900 + index * 100,
      required_permissions: [],
    }, { wallet });
    specialists[specialist.capability] = { agent, skill };
  }

  return { sponsor, coordinator, coordinatorSkill, specialists };
}

function futureIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function toIssue(error: unknown): ApiIssue {
  if (error instanceof OmniClawApiError) {
    return { status: error.status, code: error.code, message: error.message, path: error.path, details: error.details };
  }
  return { code: "CLIENT_ERROR", message: error instanceof Error ? error.message : "unknown client error", details: null };
}

function toneColor(tone: StatusTone) {
  const colors: Record<StatusTone, string> = {
    neutral: "var(--muted)",
    info: "var(--info)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
  };
  return colors[tone];
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatLamports(value: string) {
  return `${Number(value).toLocaleString()} lamports`;
}

function compactLamports(value: string) {
  const lamports = Number(value);
  if (lamports >= 1_000_000_000) {
    return `${(lamports / 1_000_000_000).toFixed(1)}B`;
  }
  if (lamports >= 1_000_000) {
    return `${(lamports / 1_000_000).toFixed(1)}M`;
  }
  if (lamports >= 1_000) {
    return `${(lamports / 1_000).toFixed(1)}K`;
  }
  return lamports.toLocaleString();
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
