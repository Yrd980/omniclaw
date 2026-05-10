"use client";

import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  BadgeCheck,
  BookOpenCheck,
  ChevronRight,
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
  type ReputationEventDto,
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
type SurfaceMode = "console" | "tour";
type TourSectionId = "hero" | "ai" | "reputation" | "payments" | "credentials" | "profile";
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
type TourData = {
  agents: AgentDto[];
  tasks: TaskDto[];
  graph: TaskGraphDto | null;
  detail: TaskDetailDto | null;
  events: EventItem[];
  market: ReturnType<typeof buildMarketSignals>;
  contractInfo: SolanaContractInfoDto | null;
  activation: PrototypeActivation | null;
};

const API_URL = process.env.NEXT_PUBLIC_OMNICLAW_API_URL ?? "http://localhost:3000";
const AGENT_STATUSES: AgentStatus[] = ["active", "paused", "suspended"];
const TASK_STATUSES: TaskStatus[] = ["created", "escrow_locked", "accepted", "in_progress", "submitted", "completed", "failed", "expired", "disputed", "cancelled"];
const ROLE_OPTIONS: Array<NonNullable<ActorHeaders["role"]> | ""> = ["", "admin", "evaluator"];
const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "network", label: "Network" },
  { value: "lifecycle", label: "Lifecycle" },
  { value: "market", label: "Market" },
  { value: "lineage", label: "Lineage" },
];
const SURFACE_MODES: Array<{ value: SurfaceMode; label: string }> = [
  { value: "console", label: "Graph Console" },
  { value: "tour", label: "Ocean Demo" },
];
const TOUR_SECTIONS: Array<{ id: TourSectionId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: "hero", label: "OmniClaw", icon: Sparkles },
  { id: "ai", label: "AI Recruits", icon: GitBranch },
  { id: "reputation", label: "Reputation", icon: BadgeCheck },
  { id: "payments", label: "Payments", icon: WalletCards },
  { id: "credentials", label: "Skill Credentials", icon: BookOpenCheck },
  { id: "profile", label: "Personal Center", icon: UserCircle },
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
  const [apiUrl, setApiUrl] = useState(API_URL);
  const client = useMemo(() => injectedClient ?? createOmniClawClient({ baseUrl: apiUrl }), [apiUrl, injectedClient]);
  const [actor, setActor] = useState<ActorHeaders>({ wallet: "wallet_operator", agentId: "", role: undefined });
  const [filters, setFilters] = useState<DiscoverAgentsFilters>({ capability: "market_research", status: "active" });
  const [taskFilters, setTaskFilters] = useState<ListTasksFilters>({});
  const [results, setResults] = useState<DiscoveryResultDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [detail, setDetail] = useState<TaskDetailDto | null>(null);
  const [graph, setGraph] = useState<TaskGraphDto | null>(null);
  const [contractInfo, setContractInfo] = useState<SolanaContractInfoDto | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [issue, setIssue] = useState<ApiIssue | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prototypeActivation, setPrototypeActivation] = useState<PrototypeActivation | null>(null);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("console");
  const [tourSection, setTourSection] = useState<TourSectionId>("hero");

  const activeActor = useMemo(() => compactActor(actor), [actor]);

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
      const [taskList, discovery] = await Promise.all([
        run("tasks", () => client.listTasks({ parent_task_id: result.parent.task_id }, activeActor)),
        run("discovery", () => client.discoverAgents({ status: "active" }, activeActor)),
      ]);
      if (taskList) {
        setTasks([result.parent, ...taskList.tasks]);
      }
      if (discovery) {
        setResults(discovery.results);
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
    const [discovery, taskList, solanaInfo] = await Promise.all([
      run("discovery", () => client.discoverAgents(cleanFilters(filters), activeActor)),
      run("tasks", () => client.listTasks(cleanTaskFilters(taskFilters), activeActor)),
      run("solana", () => client.getSolanaContractInfo(activeActor)),
    ]);
    if (discovery) {
      setResults(discovery.results);
    }
    if (solanaInfo) {
      setContractInfo(solanaInfo);
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

  useEffect(() => {
    void refreshData();
  }, []);

  const agents = useMemo(() => uniqueAgents(results), [results]);
  const events = useMemo(() => collectEvents(detail), [detail]);
  const market = useMemo(() => buildMarketSignals(results, tasks), [results, tasks]);
  const activeTask = detail?.task ?? tasks.find((task) => task.task_id === selectedTaskId) ?? null;
  const flow = useMemo(() => buildFlow(agents, results, tasks, graph, selectedTaskId, viewMode), [agents, graph, results, selectedTaskId, tasks, viewMode]);
  const tourData = useMemo<TourData>(() => ({
    agents,
    tasks,
    graph,
    detail,
    events,
    market,
    contractInfo,
    activation: prototypeActivation,
  }), [agents, contractInfo, detail, events, graph, market, prototypeActivation, tasks]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-3 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.5fr)_auto] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"><Sparkles size={14} /> OmniClaw live delegation</div>
            <h1 className="mt-1 text-xl font-semibold">Autonomous agent hiring graph</h1>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <Field label="api">
              <Input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} disabled={Boolean(injectedClient)} />
            </Field>
            <Field label="capability">
              <Input value={filters.capability ?? ""} onChange={(event) => setFilters({ ...filters, capability: event.target.value })} />
            </Field>
            <Field label="agent status">
              <Select value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: event.target.value as AgentStatus || undefined })}>
                <option value="">any</option>
                {AGENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </Field>
            <Field label="task status">
              <Select value={taskFilters.status ?? ""} onChange={(event) => setTaskFilters({ ...taskFilters, status: event.target.value as TaskStatus || undefined })}>
                <option value="">any</option>
                {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <SurfaceSwitch value={surfaceMode} onChange={setSurfaceMode} />
            <Select aria-label="actor role" value={actor.role ?? ""} onChange={(event) => setActor({ ...actor, role: event.target.value ? event.target.value as ActorHeaders["role"] : undefined })} className="w-[120px]">
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role || "observer"}</option>)}
            </Select>
            <Button onClick={refreshData} busy={busy === "discovery" || busy === "tasks"} icon={<RefreshCw size={16} />}>Refresh</Button>
          </div>
        </div>
      </header>

      {surfaceMode === "tour" ? (
        <PrototypeTour
          data={tourData}
          section={tourSection}
          busy={busy}
          issue={issue}
          notice={notice}
          onSectionChange={setTourSection}
          onRunDemo={runDemoScenario}
          onActivate={runPrototypeActivation}
          onOpenConsole={(nextViewMode) => {
            setViewMode(nextViewMode);
            setSurfaceMode("console");
          }}
        />
      ) : (
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
            <SegmentedControl value={viewMode} onChange={setViewMode} />
            <div className="flex flex-wrap items-center gap-2">
              <Signal icon={<Network size={15} />} label="agents" value={String(agents.length)} />
              <Signal icon={<GitBranch size={15} />} label="tasks" value={String(tasks.length)} />
              <Signal icon={<ShieldCheck size={15} />} label="settlement" value={contractInfo?.settlement_mode ?? "mock"} />
            </div>
          </div>

          {(issue || notice) && <Feedback issue={issue} notice={notice} />}

          <div className="min-h-[720px]">
            <div className="relative min-h-[420px]">
              {flow.nodes.length > 0 ? (
                <ReactFlow
                  nodes={flow.nodes}
                  edges={flow.edges}
                  fitView
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
          <ConsoleSummary market={market} contractInfo={contractInfo} />
          <Inspector task={activeTask} detail={detail} events={events} onSelectTask={loadTask} tasks={tasks} />
        </aside>
      </div>
      )}
    </main>
  );
}

function SurfaceSwitch({ value, onChange }: { value: SurfaceMode; onChange: (value: SurfaceMode) => void }) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--background)] p-1" aria-label="product surface">
      {SURFACE_MODES.map((mode) => (
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

function PrototypeTour({
  data,
  section,
  busy,
  issue,
  notice,
  onSectionChange,
  onRunDemo,
  onActivate,
  onOpenConsole,
}: {
  data: TourData;
  section: TourSectionId;
  busy: string | null;
  issue: ApiIssue | null;
  notice: string | null;
  onSectionChange: (section: TourSectionId) => void;
  onRunDemo: (scenario: DemoScenario) => void;
  onActivate: () => void;
  onOpenConsole: (viewMode: ViewMode) => void;
}) {
  const activeIndex = TOUR_SECTIONS.findIndex((item) => item.id === section);
  const selectedSection = TOUR_SECTIONS[Math.max(activeIndex, 0)] ?? TOUR_SECTIONS[0];
  const SectionIcon = selectedSection.icon;

  return (
    <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <nav className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 xl:sticky xl:top-4 xl:h-[calc(100vh-118px)]" aria-label="prototype tour sections">
        <div className="mb-3 px-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">prototype tour</div>
          <h2 className="mt-1 text-base font-semibold">Ocean mode, protocol data</h2>
        </div>
        <div className="grid gap-1">
          {TOUR_SECTIONS.map((item, index) => {
            const Icon = item.icon;
            const active = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={`grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${active ? "bg-[var(--selected)] text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                <span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
          This tour reads SDK/API records. Token, staking, and credential panels show ledger records, not live SPL transfers or Metaplex mints.
        </div>
      </nav>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--canvas)]">
        <div className="relative border-b border-[var(--border)] bg-[var(--ocean-band)] px-5 py-5">
          <OceanBackdrop />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                <SectionIcon size={13} /> {selectedSection.label}
              </div>
              <h1 className="mt-3 text-2xl font-semibold">OmniClaw prototype tour</h1>
              <p className="mt-2 max-w-[72ch] text-sm text-[var(--muted)]">
                A spatial, ocean-inspired walkthrough of the protocol console. Each panel is backed by the same agents, tasks, settlement events, ledgers, credentials, and wallet profile aggregation used by the graph.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onOpenConsole("lineage")} icon={<Network size={16} />}>Open graph console</Button>
              <Button onClick={onActivate} busy={busy === "prototype"} icon={<Zap size={16} />}>Seed tour data</Button>
            </div>
          </div>
        </div>

        {(issue || notice) && <Feedback issue={issue} notice={notice} />}

        <div className="grid gap-4 p-4">
          {section === "hero" && <TourHero data={data} onRunDemo={onRunDemo} busy={busy} onOpenConsole={onOpenConsole} />}
          {section === "ai" && <TourAiRecruits data={data} onRunDemo={onRunDemo} busy={busy} onOpenConsole={onOpenConsole} />}
          {section === "reputation" && <TourReputation data={data} onActivate={onActivate} busy={busy} />}
          {section === "payments" && <TourPayments data={data} onActivate={onActivate} busy={busy} />}
          {section === "credentials" && <TourCredentials data={data} onActivate={onActivate} busy={busy} />}
          {section === "profile" && <TourProfile data={data} onActivate={onActivate} busy={busy} />}
        </div>
      </section>
    </div>
  );
}

function OceanBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-[-10%] bottom-[-32px] h-28 opacity-55">
        <div className="absolute inset-0 rounded-[50%] border-t border-[var(--ocean-line)]" />
        <div className="absolute inset-x-[6%] top-5 h-20 rounded-[50%] border-t border-[var(--ocean-line-soft)]" />
        <div className="absolute inset-x-[18%] top-10 h-16 rounded-[50%] border-t border-[var(--ocean-line-soft)]" />
      </div>
      <div className="absolute right-10 top-8 h-20 w-20 rounded-full border border-[var(--border)] bg-[var(--selected)] opacity-30" />
    </div>
  );
}

function TourHero({ data, onRunDemo, busy, onOpenConsole }: { data: TourData; onRunDemo: (scenario: DemoScenario) => void; busy: string | null; onOpenConsole: (viewMode: ViewMode) => void }) {
  const completed = data.tasks.filter((task) => task.status === "completed").length;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <section className="min-h-[360px] rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="max-w-[760px]">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            <Coins size={13} /> graph-first protocol console
          </div>
          <h2 className="text-3xl font-semibold">Autonomous agents hire, settle, and leave an inspectable trail.</h2>
          <p className="mt-3 max-w-[70ch] text-sm text-[var(--muted)]">
            The prototype ocean becomes a product tour here: no fake balances, no implied live NFT minting, no marketing replacement. Run a scenario to create live SDK/API graph data, then inspect the same state in the console.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {DEMO_SCENARIOS.map((scenario) => (
            <Button
              key={scenario.slug}
              variant="secondary"
              onClick={() => onRunDemo(scenario)}
              busy={busy === `demo:${scenario.slug}`}
              icon={<Rocket size={16} style={{ color: toneColor(scenario.accent) }} />}
            >
              {scenario.label}
            </Button>
          ))}
          <Button onClick={() => onOpenConsole("lineage")} icon={<ChevronRight size={16} />}>Inspect lineage</Button>
        </div>
      </section>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">live state</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TourMetric icon={<Network size={16} />} label="agents" value={String(data.agents.length)} />
          <TourMetric icon={<GitBranch size={16} />} label="tasks" value={String(data.tasks.length)} />
          <TourMetric icon={<ShieldCheck size={16} />} label="completed tasks" value={String(completed)} />
          <TourMetric icon={<WalletCards size={16} />} label="settlement mode" value={data.contractInfo?.settlement_mode ?? "loading"} />
        </div>
      </section>
    </div>
  );
}

function TourAiRecruits({ data, onRunDemo, busy, onOpenConsole }: { data: TourData; onRunDemo: (scenario: DemoScenario) => void; busy: string | null; onOpenConsole: (viewMode: ViewMode) => void }) {
  const rootTasks = data.tasks.filter((task) => task.parent_task_id === null);
  const childTasks = data.tasks.filter((task) => task.parent_task_id !== null);
  const graphEdges = data.graph?.edges.length ?? childTasks.length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">AI recruits AI</div>
            <h2 className="mt-1 text-xl font-semibold">Delegation workflow from task graph data</h2>
          </div>
          <Button variant="secondary" onClick={() => onOpenConsole("lineage")} icon={<Network size={16} />}>Graph view</Button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <WorkflowStep index={1} title="Sponsor hires coordinator" value={`${rootTasks.length} root task${rootTasks.length === 1 ? "" : "s"}`} />
          <WorkflowStep index={2} title="Coordinator hires specialists" value={`${childTasks.length} child task${childTasks.length === 1 ? "" : "s"}`} />
          <WorkflowStep index={3} title="API returns lineage edges" value={`${graphEdges} edge${graphEdges === 1 ? "" : "s"}`} />
        </div>
        <div className="mt-5 grid gap-2">
          {data.tasks.slice(0, 8).map((task) => (
            <div key={task.task_id} className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm md:grid-cols-[1fr_160px_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs">{task.task_id}</div>
                <div className="truncate text-xs text-[var(--muted)]">{task.parent_task_id ? `child of ${task.parent_task_id}` : "root coordination task"}</div>
              </div>
              <div className="font-mono text-xs text-[var(--muted)]">{formatLamports(task.payment_lamports)}</div>
              <StatusBadge status={task.status} />
            </div>
          ))}
          {data.tasks.length === 0 && <TourEmpty action="Run a demo scenario to create parent and child tasks." />}
        </div>
      </section>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">seed scenario</div>
        <div className="grid gap-2">
          {DEMO_SCENARIOS.map((scenario) => (
            <Button key={scenario.slug} variant="secondary" onClick={() => onRunDemo(scenario)} busy={busy === `demo:${scenario.slug}`} icon={<Rocket size={16} />}>
              {scenario.label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

function TourReputation({ data, onActivate, busy }: { data: TourData; onActivate: () => void; busy: string | null }) {
  const ranked = [...data.agents].sort((a, b) => b.reputation_score - a.reputation_score || Number(b.stake_amount) - Number(a.stake_amount)).slice(0, 6);
  const stake = data.activation?.stake;
  return (
    <TourTwoColumn
      title="Reputation & staking"
      kicker="agent aggregates and stake ledger"
      action={<Button onClick={onActivate} busy={busy === "prototype"} icon={<Zap size={16} />}>Seed stake ledger</Button>}
      primary={ranked.length > 0 ? ranked.map((agent, index) => (
        <AgentRankRow key={agent.agent_id} agent={agent} rank={index + 1} />
      )) : <TourEmpty action="Seed tour data or run a scenario to register ranked agents." />}
      secondary={
        <div className="grid gap-3">
          <TourMetric icon={<BadgeCheck size={16} />} label="avg reputation" value={data.market.avgReputation.toFixed(0)} />
          <TourMetric icon={<Layers3 size={16} />} label="last stake event" value={stake ? stake.event_type : "none"} />
          <TourMetric icon={<Coins size={16} />} label="resulting stake" value={stake ? formatLamports(stake.resulting_stake_lamports) : "no ledger record"} />
        </div>
      }
    />
  );
}

function TourPayments({ data, onActivate, busy }: { data: TourData; onActivate: () => void; busy: string | null }) {
  const profile = data.activation?.profile;
  const accounts = profile?.token_accounts ?? [];
  const transfers = profile?.token_transfers ?? [];
  return (
    <TourTwoColumn
      title="Payment gateway"
      kicker="wallet token ledger and settlement history"
      action={<Button onClick={onActivate} busy={busy === "prototype"} icon={<WalletCards size={16} />}>Seed token ledger</Button>}
      primary={
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <div key={account.account_id} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">{account.symbol}</div>
                <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs">API ledger</span>
              </div>
              <div className="mt-3 font-mono text-lg">{formatLamports(account.balance_lamports)}</div>
            </div>
          ))}
          {accounts.length === 0 && <TourEmpty action="Seed tour data to credit and swap wallet token ledger records." />}
        </div>
      }
      secondary={
        <div className="grid gap-3">
          <TourMetric icon={<ShieldCheck size={16} />} label="settlement adapter" value={data.contractInfo?.settlement_mode ?? "loading"} />
          <TourMetric icon={<BadgeDollarSign size={16} />} label="task settlement events" value={String(data.events.filter((event) => event.kind === "settlement").length)} />
          <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
            Token records are wallet ledger entries exposed by the SDK/API. This panel does not present them as live SPL transfers.
          </div>
          {transfers.slice(0, 4).map((transfer) => (
            <EventLite key={transfer.transfer_id} label={transfer.transfer_type} value={`${transfer.from_symbol ?? "mint"} to ${transfer.to_symbol}`} meta={formatLamports(transfer.received_lamports)} />
          ))}
        </div>
      }
    />
  );
}

function TourCredentials({ data, onActivate, busy }: { data: TourData; onActivate: () => void; busy: string | null }) {
  const credentials = data.activation?.profile.skill_credentials ?? (data.activation ? [data.activation.credential] : []);
  return (
    <TourTwoColumn
      title="Skill credentials"
      kicker="Skill NFT concept as API credential records"
      action={<Button onClick={onActivate} busy={busy === "prototype"} icon={<BookOpenCheck size={16} />}>Mint credential record</Button>}
      primary={
        <div className="grid gap-3 md:grid-cols-2">
          {credentials.map((credential) => (
            <div key={credential.credential_id} className="rounded-md border border-[var(--border)] bg-[var(--background)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{credential.name}</div>
                  <div className="mt-1 font-mono text-xs text-[var(--muted)]">{credential.credential_id}</div>
                </div>
                <span className="rounded-md border px-2 py-1 text-xs font-medium" style={{ borderColor: toneColor("success"), color: toneColor("success") }}>{credential.rarity}</span>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-[var(--muted)]">
                <span>skill: {credential.skill_id}</span>
                <span>owner: {credential.owner_wallet}</span>
              </div>
            </div>
          ))}
          {credentials.length === 0 && <TourEmpty action="Seed tour data to create SDK/API skill credential records." />}
        </div>
      }
      secondary={
        <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
          The prototype called these Skill NFTs. OmniClaw currently stores credential records through the API; no Metaplex NFT mint is shown as live behavior.
        </div>
      }
    />
  );
}

function TourProfile({ data, onActivate, busy }: { data: TourData; onActivate: () => void; busy: string | null }) {
  const profile = data.activation?.profile;
  return (
    <TourTwoColumn
      title="Personal Center"
      kicker="wallet profile aggregation"
      action={<Button onClick={onActivate} busy={busy === "prototype"} icon={<UserCircle size={16} />}>Seed profile</Button>}
      primary={profile ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TourMetric icon={<UserCircle size={16} />} label="wallet" value={profile.wallet} />
          <TourMetric icon={<Network size={16} />} label="agents" value={String(profile.agents.length)} />
          <TourMetric icon={<GitBranch size={16} />} label="tasks" value={String(profile.tasks.length)} />
          <TourMetric icon={<BadgeDollarSign size={16} />} label="settlement events" value={String(profile.settlement_events.length)} />
          <TourMetric icon={<WalletCards size={16} />} label="token transfers" value={String(profile.token_transfers.length)} />
          <TourMetric icon={<BookOpenCheck size={16} />} label="credentials" value={String(profile.skill_credentials.length)} />
        </div>
      ) : <TourEmpty action="Seed tour data to load an aggregated wallet profile." />}
      secondary={
        <div className="grid gap-2">
          {(profile?.tasks ?? data.tasks).slice(0, 5).map((task) => (
            <EventLite key={task.task_id} label={task.task_id} value={task.status} meta={formatLamports(task.payment_lamports)} />
          ))}
        </div>
      }
    />
  );
}

function TourTwoColumn({ title, kicker, action, primary, secondary }: { title: string; kicker: string; action: React.ReactNode; primary: React.ReactNode; secondary: React.ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{kicker}</div>
            <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          </div>
          {action}
        </div>
        {primary}
      </section>
      <aside className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        {secondary}
      </aside>
    </div>
  );
}

function TourMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--muted)]">{icon}{label}</div>
      <div className="break-all text-sm font-semibold">{value}</div>
    </div>
  );
}

function WorkflowStep({ index, title, value }: { index: number; title: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-[var(--selected)] font-mono text-sm font-semibold text-[var(--accent)]">{index}</div>
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm text-[var(--muted)]">{value}</div>
    </div>
  );
}

function AgentRankRow({ agent, rank }: { agent: AgentDto; rank: number }) {
  return (
    <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm md:grid-cols-[44px_1fr_120px_140px] md:items-center">
      <div className="font-mono text-xs text-[var(--muted)]">#{rank}</div>
      <div className="min-w-0">
        <div className="truncate font-semibold">{agent.name}</div>
        <div className="truncate font-mono text-xs text-[var(--muted)]">{agent.agent_id}</div>
      </div>
      <div className="font-mono">{agent.reputation_score.toFixed(0)} rep</div>
      <div className="font-mono text-xs text-[var(--muted)]">{formatLamports(agent.stake_amount)}</div>
    </div>
  );
}

function EventLite({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
      <div className="break-all font-semibold">{label}</div>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
        <span>{value}</span>
        <span className="font-mono">{meta}</span>
      </div>
    </div>
  );
}

function TourEmpty({ action }: { action: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--background)] p-4 text-sm text-[var(--muted)]">
      {action}
    </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
      <span>{label}</span>
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

function ConsoleSummary({ market, contractInfo }: { market: ReturnType<typeof buildMarketSignals>; contractInfo: SolanaContractInfoDto | null }) {
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
        <Metric label="total_payment_lamports" value={formatLamports(market.totalPayment)} />
        <Metric label="avg_reputation" value={market.avgReputation.toFixed(0)} />
      </div>
    </section>
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
  const showMarket = viewMode === "all" || viewMode === "market";
  const showNetwork = viewMode === "all" || viewMode === "network";
  const showLineage = viewMode === "all" || viewMode === "lineage";
  const showLifecycle = viewMode === "all" || viewMode === "lifecycle";

  if (showNetwork || showMarket) {
    agents.forEach((agent, index) => {
      const angle = (index / Math.max(agents.length, 1)) * Math.PI * 2;
      const radius = showMarket ? 250 + clamp(agent.reputation_score, 0, 100) : 260;
      nodes.push({
        id: `agent:${agent.agent_id}`,
        type: "default",
        position: { x: 380 + Math.cos(angle) * radius, y: 260 + Math.sin(angle) * radius },
        data: {
          tone: STATUS_META[agent.status].tone,
          label: <AgentNode agent={agent} />,
        },
      });
    });
    results.forEach((result, index) => {
      const skillId = `skill:${result.skill.skill_id}`;
      nodes.push({
        id: skillId,
        type: "default",
        position: { x: 620 + (index % 3) * 220, y: 120 + Math.floor(index / 3) * 150 },
        data: {
          tone: "info",
          label: <SkillNode result={result} />,
        },
      });
      edges.push({
        id: `agent-skill:${result.agent.agent_id}:${result.skill.skill_id}`,
        source: `agent:${result.agent.agent_id}`,
        target: skillId,
        animated: true,
      });
    });
  }

  if (showLifecycle) {
    LIFECYCLE.forEach((status, index) => {
      nodes.push({
        id: `state:${status}`,
        type: "default",
        position: { x: 80 + index * 210, y: 620 },
        data: {
          tone: STATUS_META[status].tone,
          label: <StateNode status={status} />,
        },
      });
      if (index > 0) {
        edges.push({
          id: `state-edge:${LIFECYCLE[index - 1]}:${status}`,
          source: `state:${LIFECYCLE[index - 1]}`,
          target: `state:${status}`,
          animated: true,
        });
      }
    });
  }

  if (showLineage) {
    const graphTasks = graph?.nodes.map((node) => ({
      task_id: node.taskId,
      parent_task_id: node.parentTaskId,
      worker_agent_id: node.workerAgentId,
      payment_lamports: node.paymentLamports,
      worker_payout_lamports: node.workerPayoutLamports,
      status: node.status,
      deadline: node.deadline,
    })) ?? tasks;
    graphTasks.forEach((task, index) => {
      const id = `task:${task.task_id}`;
      nodes.push({
        id,
        type: "default",
        position: { x: 120 + (index % 4) * 280, y: 880 + Math.floor(index / 4) * 180 },
        data: {
          tone: STATUS_META[task.status].tone,
          label: <TaskNode task={task} selected={selectedTaskId === task.task_id} />,
        },
      });
    });
    const graphEdges = graph?.edges.map((edge) => ({ from: edge.from, to: edge.to })) ?? tasks.filter((task) => task.parent_task_id).map((task) => ({ from: task.parent_task_id as string, to: task.task_id }));
    graphEdges.forEach((edge) => {
      edges.push({
        id: `task-edge:${edge.from}:${edge.to}`,
        source: `task:${edge.from}`,
        target: `task:${edge.to}`,
        animated: true,
      });
    });
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

function compactActor(actor: ActorHeaders): ActorHeaders {
  return {
    wallet: actor.wallet || undefined,
    agentId: actor.agentId || undefined,
    role: actor.role || undefined,
  };
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
