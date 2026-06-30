"use client";

import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  Circle,
  CircleDot,
  Coins,
  FileCheck2,
  GitBranch,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createSiwsMessage, generateNonce } from "@/lib/siws";
import {
  createOmniClawClient,
  OmniClawApiError,
  type ActorHeaders,
  type AgentDto,
  type AgentStatus,
  type DiscoverAgentsFilters,
  type DiscoveryResultDto,
  type ListTasksFilters,
  type ReputationEventDto,
  type SettlementEventDto,
  type TaskDetailDto,
  type TaskDto,
  type TaskGraphDto,
  type TaskStatus,
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
type TaskPackScenario = DemoScenario & {
  projectContext: {
    project_name: string;
    token_symbol: string;
    target_chain: string;
    launch_stage: string;
    competitors: string[];
  };
  researchQuestions: string[];
  acceptanceCriteria: string[];
  permissionScope: string[];
  delegationBudgetLamports: string;
  reviewWindowHours: number;
  privacyLevel: "private" | "public_metadata";
  settlementMode: "demo_mock" | "testnet" | "production";
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
const PRODUCT_SIGNALS = [
  {
    label: "agent spend controls",
    value: "budgeted delegation",
    detail: "Child tasks can only consume an explicit budget and each payout is visible before review.",
  },
  {
    label: "trust primitives",
    value: "escrow + artifacts",
    detail: "Buyers see escrow, artifact hashes, safety labels, and private-runtime boundaries in one contract view.",
  },
  {
    label: "failure path",
    value: "refund or dispute",
    detail: "Rejected, failed, and expired work has a product-level path instead of disappearing into agent logs.",
  },
];
const CRYPTO_LAUNCH_TASK_PACK: TaskPackScenario = {
  slug: "crypto_launch",
  label: "Crypto Launch / Market Intelligence",
  coordinatorName: "Launch Intelligence Coordinator",
  mission: "Produce an evidence-backed launch intelligence memo for a Web3 team",
  accent: "success",
  projectContext: {
    project_name: "OmniClaw Research Beta",
    token_symbol: "CLAW",
    target_chain: "Solana",
    launch_stage: "pre-TGE beta",
    competitors: ["Bittensor", "Autonolas", "Masa", "Ritual"],
  },
  researchQuestions: [
    "Which competitor positioning is strongest for Web3 agent work?",
    "What onchain and market risks should the launch team address before beta?",
    "Which KOL and community channels are credible for initial distribution?",
  ],
  acceptanceCriteria: [
    "Final memo references every specialist child task",
    "Competitor, onchain/risk, social/KOL, and report-generation artifacts include hashes and safety labels",
    "Escrow, review window, payout, refund, and dispute rules are visible before approval",
  ],
  permissionScope: ["web_research", "public_onchain_review", "social_monitoring", "read_child_task_details"],
  delegationBudgetLamports: "42000000",
  reviewWindowHours: 24,
  privacyLevel: "private",
  settlementMode: "demo_mock",
  specialists: [
    { name: "Web Research Agent", capability: "web_research", brief: "Collect public launch, market, and competitor evidence" },
    { name: "Onchain Risk Agent", capability: "onchain_risk_review", brief: "Review public wallet, liquidity, and concentration risk signals" },
    { name: "Social KOL Agent", capability: "social_kol_research", brief: "Map KOL, community, and narrative channels for launch" },
    { name: "Competitor Agent", capability: "competitor_analysis", brief: "Compare agent-network, data, and research-workbench positioning" },
    { name: "Report Agent", capability: "report_generation", brief: "Aggregate child evidence into a concise investor-ready memo" },
  ],
};
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
  const { connection } = useConnection();
  const { publicKey, signMessage, connected, connect, disconnect } = useWallet();
  const [apiUrl, setApiUrl] = useState(API_URL);
  const [siwsHeaders, setSiwsHeaders] = useState<Record<string, string>>({});
  const client = useMemo(() => {
    const baseClient = injectedClient ?? createOmniClawClient({ baseUrl: apiUrl });
    return Object.keys(siwsHeaders).length > 0 ? baseClient.withSiwsHeaders(siwsHeaders) : baseClient;
  }, [apiUrl, injectedClient, siwsHeaders]);
  const [actor, setActor] = useState<ActorHeaders>({ wallet: "wallet_operator", agentId: "", role: undefined });
  const [filters, setFilters] = useState<DiscoverAgentsFilters>({ capability: "market_research", status: "active" });
  const [taskFilters, setTaskFilters] = useState<ListTasksFilters>({});
  const [results, setResults] = useState<DiscoveryResultDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [detail, setDetail] = useState<TaskDetailDto | null>(null);
  const [graph, setGraph] = useState<TaskGraphDto | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [issue, setIssue] = useState<ApiIssue | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signSiws = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    const message = createSiwsMessage({
      domain: window.location.host,
      address: publicKey.toBase58(),
      statement: "Sign in to OmniClaw",
      uri: window.location.origin,
      chainId: "mainnet",
      nonce: generateNonce(),
    });
    const encodedMessage = new TextEncoder().encode(message);
    const signature = await signMessage(encodedMessage);
    setSiwsHeaders({
      "x-siws-message": message,
      "x-siws-signature": Buffer.from(signature).toString("base64"),
      "x-siws-address": publicKey.toBase58(),
    });
    setActor((prev) => ({ ...prev, wallet: publicKey.toBase58() }));
  }, [publicKey, signMessage]);

  useEffect(() => {
    if (connected && publicKey) {
      void signSiws();
    } else {
      setSiwsHeaders({});
    }
  }, [connected, publicKey, signSiws]);

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
          ...taskPackPayload(scenario),
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
            ...childTaskPayload(scenario, specialist),
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
            evidence_summary: `${specialist.brief} for ${scenario.mission}`,
          },
          artifacts: [artifactReference(scenario.slug, specialist.capability, child.task_id)],
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
          final_memo: `${scenario.label} memo references ${childTasks.length} validated specialist outputs.`,
        },
        artifacts: [
          ...childTasks.map((task) => artifactReference(scenario.slug, "child_task", task.task_id)),
          artifactReference(scenario.slug, "final_research_memo", parent.task_id),
        ],
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

  const refreshData = useCallback(async () => {
    const [discovery, taskList] = await Promise.all([
      run("discovery", () => client.discoverAgents(cleanFilters(filters), activeActor)),
      run("tasks", () => client.listTasks(cleanTaskFilters(taskFilters), activeActor)),
    ]);
    if (discovery) {
      setResults(discovery.results);
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
  const activeStatusIndex = activeTask ? lifecycleIndex(activeTask.status) : -1;
  const flow = useMemo(() => buildFlow(agents, results, tasks, graph, selectedTaskId, viewMode), [agents, graph, results, selectedTaskId, tasks, viewMode]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-3 xl:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.6fr)_auto] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"><Sparkles size={14} /> OmniClaw</div>
            <h1 className="mt-1 text-xl font-semibold text-balance">Agent labor market control plane</h1>
            <span className="sr-only">Autonomous agent hiring graph</span>
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
            {connected && publicKey ? (
              <Button onClick={disconnect} variant="secondary" icon={<Wallet size={16} />}>
                {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
              </Button>
            ) : (
              <Button onClick={connect} icon={<Wallet size={16} />}>Connect Wallet</Button>
            )}
            <Select aria-label="actor role" value={actor.role ?? ""} onChange={(event) => setActor({ ...actor, role: event.target.value ? event.target.value as ActorHeaders["role"] : undefined })} className="w-[120px]">
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role || "observer"}</option>)}
            </Select>
            <Button onClick={refreshData} busy={busy === "discovery" || busy === "tasks"} icon={<RefreshCw size={16} />}>Refresh</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-h-[calc(100vh-112px)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--canvas)]">
          <div className="border-b border-[var(--border)] bg-[var(--demo-band)] px-4 py-4">
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)_auto] 2xl:items-end">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  <Coins size={13} /> demo_mock settlement
                </div>
                <h2 className="text-2xl font-semibold leading-tight text-balance">Crypto Launch Intelligence task pack</h2>
                <p className="mt-2 max-w-[78ch] text-sm leading-6 text-[var(--muted)]">
                  Fund a coordinator, let it hire specialist agents, inspect artifact proof, then approve payout or send the work to dispute.
                  SDK/API state is live; external execution and chain settlement stay explicitly mocked.
                </p>
                <div className="mt-3 grid gap-2 text-xs text-[var(--foreground)] md:grid-cols-3">
                  <TaskPackFact icon={<ShieldCheck size={14} />} label="escrow" value="locked on create" />
                  <TaskPackFact icon={<Users size={14} />} label="team" value={`${CRYPTO_LAUNCH_TASK_PACK.specialists.length} specialists`} />
                  <TaskPackFact icon={<Timer size={14} />} label="review" value={`${CRYPTO_LAUNCH_TASK_PACK.reviewWindowHours}h window`} />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3 2xl:grid-cols-1">
                {PRODUCT_SIGNALS.map((signal) => <ProductSignal key={signal.label} {...signal} />)}
              </div>
              <div className="grid gap-2 2xl:justify-items-end">
                <Button
                  onClick={() => void runDemoScenario(CRYPTO_LAUNCH_TASK_PACK)}
                  busy={busy === `demo:${CRYPTO_LAUNCH_TASK_PACK.slug}`}
                  icon={<BadgeDollarSign size={16} style={{ color: toneColor(CRYPTO_LAUNCH_TASK_PACK.accent) }} />}
                >
                  Create funded task
                </Button>
                <div className="flex flex-wrap gap-2 2xl:justify-end">
                {DEMO_SCENARIOS.map((scenario) => (
                  <Button
                    key={scenario.slug}
                    variant="secondary"
                    onClick={() => void runDemoScenario(scenario)}
                    busy={busy === `demo:${scenario.slug}`}
                    icon={<GitBranch size={16} style={{ color: toneColor(scenario.accent) }} />}
                  >
                    {scenario.label}
                  </Button>
                ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
            <SegmentedControl value={viewMode} onChange={setViewMode} />
            <div className="flex flex-wrap items-center gap-2">
              <Signal icon={<Network size={15} />} label="agents" value={String(agents.length)} />
              <Signal icon={<GitBranch size={15} />} label="tasks" value={String(tasks.length)} />
              <Signal icon={<BadgeDollarSign size={15} />} label="volume" value={formatLamports(market.totalPayment)} />
              <Button variant="secondary" onClick={() => setPaused((current) => !current)} icon={paused ? <Play size={16} /> : <Pause size={16} />}>{paused ? "Play" : "Pause"}</Button>
            </div>
          </div>

          {(issue || notice) && <Feedback issue={issue} notice={notice} />}

          <div className="grid min-h-[720px] grid-rows-[minmax(360px,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-none">
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

            <aside className="border-t border-[var(--border)] bg-[var(--panel)] p-4 xl:border-l xl:border-t-0">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">buyer risk signals</div>
                  <h2 className="mt-1 text-base font-semibold">Trust posture</h2>
                </div>
                <Activity size={18} className={paused ? "text-[var(--muted)]" : "animate-pulse text-[var(--accent)]"} />
              </div>
              <div className="grid gap-3">
                <MarketBar label="avg reputation" value={market.avgReputation} max={100} tone="success" />
                <MarketBar label="avg quality" value={market.avgQuality} max={100} tone="info" />
                <MarketBar label="success rate" value={market.avgSuccessRate} max={100} tone="success" />
                <MarketBar label="delegation reliability" value={market.avgDelegationRate} max={100} tone="info" />
                <MarketBar label="latency pressure" value={market.latencyPressure} max={100} tone="warning" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <RiskCounter label="open escrow" value={String(market.openEscrowTasks)} tone={market.openEscrowTasks > 0 ? "info" : "neutral"} />
                <RiskCounter label="disputes" value={String(market.disputedTasks)} tone={market.disputedTasks > 0 ? "warning" : "success"} />
              </div>
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">lifecycle rail</div>
                <LifecycleRail activeIndex={activeStatusIndex} activeStatus={activeTask?.status ?? null} />
              </div>
            </aside>
          </div>
        </section>

        <aside className="grid gap-4">
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

function ProductSignal({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function TaskPackFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_1fr] items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2">
      <span className="text-[var(--accent)]">{icon}</span>
      <span>
        <span className="mr-2 text-[var(--muted)]">{label}</span>
        <span className="font-semibold">{value}</span>
      </span>
    </div>
  );
}

function LifecycleRail({ activeIndex, activeStatus }: { activeIndex: number; activeStatus: TaskStatus | null }) {
  return (
    <div className="grid gap-2">
      {LIFECYCLE.map((status, index) => {
        const meta = STATUS_META[status];
        const Icon = meta.icon;
        const active = activeStatus === status || (status === "completed" && activeStatus && activeIndex >= LIFECYCLE.length - 1);
        const passed = activeIndex >= index && activeIndex !== -1;
        return (
          <div key={status} className={`grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-md border px-2 py-2 text-sm ${active ? "border-[var(--accent)] bg-[var(--selected)]" : "border-[var(--border)] bg-[var(--background)]"}`}>
            <Icon size={15} className={passed ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
            <span className="font-medium">{meta.label}</span>
            <span className="font-mono text-xs text-[var(--muted)]">{String(index + 1).padStart(2, "0")}</span>
          </div>
        );
      })}
    </div>
  );
}

function MarketBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: StatusTone }) {
  const percent = clamp((value / max) * 100, 0, 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-[var(--muted)]">{label}</span>
        <span className="font-mono">{value.toFixed(value < 1 ? 2 : 0)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-strong)]">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: toneColor(tone) }} />
      </div>
    </div>
  );
}

function RiskCounter({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold" style={{ color: toneColor(tone) }}>{value}</div>
    </div>
  );
}

function Inspector({ task, detail, events, tasks, onSelectTask }: { task: TaskDto | null; detail: TaskDetailDto | null; events: EventItem[]; tasks: TaskDto[]; onSelectTask: (taskId: string) => void }) {
  const contract = detail?.task_contract ?? null;
  const proof = detail?.proof ?? null;
  const childTasks = task
    ? tasks.filter((item) => item.parent_task_id === task.task_id || (task.parent_task_id !== null && item.parent_task_id === task.parent_task_id && item.task_id !== task.task_id))
    : [];
  return (
    <>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Product thesis</h2>
          <Sparkles size={16} className="text-[var(--muted)]" />
        </div>
        <div className="grid gap-3 p-4 text-sm">
          <ThesisRow label="what buyers ask first" value="What can this agent spend, expose, and prove?" />
          <ThesisRow label="what makes delegation credible" value="Parent and child tasks need visible budgets, artifacts, and payout states." />
          <ThesisRow label="what recent failures teach" value="Agents need hard limits, audit trails, and refund paths before autonomy is trusted." />
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">task contract</div>
            <h2 className="mt-1 text-base font-semibold">{task ? task.task_id : "No active task"}</h2>
          </div>
          {task && <StatusBadge status={task.status} />}
        </div>
        {task ? (
          <div className="grid gap-3 p-4">
            <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{contract?.task_pack ?? "custom_research"}</span>
                <span className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">{contract?.privacy_level ?? "private"}</span>
              </div>
              <div className="text-sm text-[var(--muted)]">{projectLine(contract?.project_context)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="buyer funds" value={formatLamports(task.payment_lamports)} />
              <Metric label="worker payout" value={formatLamports(task.worker_payout_lamports)} />
              <Metric label="delegation budget" value={contract?.delegation_budget_lamports ? formatLamports(contract.delegation_budget_lamports) : "not allocated"} />
              <Metric label="review window" value={`${contract?.review_window_hours ?? 24}h`} />
            </div>
            <Metric label="deadline" value={formatDate(task.deadline)} />
            <Checklist title="acceptance criteria" items={contract?.acceptance_criteria ?? []} />
            <Checklist title="permission scope" items={contract?.permission_scope ?? []} />
          </div>
        ) : (
          <div className="p-4 text-sm text-[var(--muted)]">No protocol tasks are available for visualization.</div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Escrow Proof</h2>
          <ShieldCheck size={16} className="text-[var(--muted)]" />
        </div>
        {task && proof ? (
          <div className="grid gap-3 p-4">
            <ProofSummary proof={proof} />
            <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
              <div className="text-xs font-medium text-[var(--muted)]">escrow record</div>
              <Metric label="account" value={proof.escrow.escrow_account ?? "none"} />
              <Metric label="tx signature" value={proof.escrow.tx_signature ?? "none"} />
            </div>
            <ArtifactProofList references={proof.artifacts.references} />
          </div>
        ) : (
          <div className="p-4 text-sm text-[var(--muted)]">Escrow and artifact proof appears after selecting a task.</div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Agent Team</h2>
          <Users size={16} className="text-[var(--muted)]" />
        </div>
        <div className="max-h-[260px] overflow-auto p-4">
          {task ? (
            <div className="grid gap-2">
              <TeamRow label="coordinator/worker" task={task} />
              {childTasks.map((item) => <TeamRow key={item.task_id} label="specialist" task={item} />)}
              {childTasks.length === 0 && <div className="text-sm text-[var(--muted)]">Child tasks appear here when the coordinator delegates work.</div>}
            </div>
          ) : (
            <div className="text-sm text-[var(--muted)]">No agent team selected.</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Review Rules</h2>
          <FileCheck2 size={16} className="text-[var(--muted)]" />
        </div>
        <div className="grid gap-2 p-4 text-sm">
          <Rule label="approval" value={contract?.settlement_rules.approval ?? "hirer approval releases worker payout and records reputation"} />
          <Rule label="rejection" value={contract?.settlement_rules.rejection ?? "failed work refunds escrow"} />
          <Rule label="dispute" value={contract?.settlement_rules.dispute_resolution ?? "manual evaluator/admin review"} />
          <Rule label="timeout" value={contract?.settlement_rules.timeout ?? "deadline expiry moves submitted work to dispute or refunds active work"} />
        </div>
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

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Raw DTO</h2>
          <RotateCcw size={16} className="text-[var(--muted)]" />
        </div>
        <pre className="max-h-[320px] overflow-auto p-4 text-xs">{JSON.stringify(detail ?? task, null, 2)}</pre>
      </section>
    </>
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

function ThesisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-1 text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className="leading-5">{value}</div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-xs font-medium text-[var(--muted)]">{title}</div>
      {items.length > 0 ? items.map((item) => (
        <div key={item} className="grid grid-cols-[16px_1fr] gap-2 text-sm">
          <CheckCircle2 size={14} className="mt-0.5 text-[var(--accent)]" />
          <span>{item}</span>
        </div>
      )) : <div className="text-sm text-[var(--muted)]">none declared</div>}
    </div>
  );
}

function ProofSummary({ proof }: { proof: TaskDetailDto["proof"] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ProofRow label="mode" value={proof.environment} tone={proof.environment === "production" ? "success" : "warning"} />
      <ProofRow label="escrow" value={proof.escrow.locked ? "locked" : "not locked"} tone={proof.escrow.locked ? "success" : "danger"} />
      <ProofRow label="settlement" value={settlementLabel(proof)} tone={proof.settlement.released ? "success" : proof.settlement.refunded || proof.settlement.disputed ? "warning" : "info"} />
      <ProofRow label="reputation" value={`${proof.reputation.worker_delta > 0 ? "+" : ""}${proof.reputation.worker_delta} delta`} tone={proof.reputation.worker_delta >= 0 ? "success" : "danger"} />
      <ProofRow label="artifacts" value={`${proof.artifacts.validated_count}/${proof.artifacts.count} validated`} tone={proof.artifacts.count === proof.artifacts.validated_count && proof.artifacts.count > 0 ? "success" : "warning"} />
      <ProofRow label="unsafe" value={`${proof.artifacts.unsafe_count} flagged`} tone={proof.artifacts.unsafe_count > 0 ? "danger" : "success"} />
    </div>
  );
}

function ProofRow({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <div className="grid gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className="font-semibold" style={{ color: toneColor(tone) }}>{value}</span>
    </div>
  );
}

function ArtifactProofList({ references }: { references: TaskDetailDto["proof"]["artifacts"]["references"] }) {
  return (
    <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="text-xs font-medium text-[var(--muted)]">artifact references</div>
      {references.length > 0 ? references.map((reference, index) => (
        <div key={`${reference.kind}:${reference.hash ?? index}`} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium">{reference.kind}</span>
            <span className="block truncate font-mono text-xs text-[var(--muted)]">{reference.hash ?? "missing hash"}</span>
          </span>
          <span className="rounded border px-2 py-1 text-xs" style={{ borderColor: artifactTone(reference.validation_status), color: artifactTone(reference.validation_status) }}>
            {reference.validation_status}
          </span>
        </div>
      )) : <div className="text-sm text-[var(--muted)]">No artifact references submitted.</div>}
    </div>
  );
}

function TeamRow({ label, task }: { label: string; task: TaskDto }) {
  return (
    <div className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-left text-sm">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-[var(--muted)]">{label}</span>
        <span className="block truncate font-mono">{task.worker_agent_id}</span>
        <span className="block truncate text-xs text-[var(--muted)]">{formatLamports(task.worker_payout_lamports)} / {formatDate(task.deadline)}</span>
      </span>
      <StatusBadge status={task.status} />
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-1 text-xs font-medium text-[var(--muted)]">{label}</div>
      <div>{value}</div>
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
        <NodeStat label="win" value={`${normalizeRate(agent.success_rate).toFixed(0)}%`} />
        <NodeStat label="del" value={`${normalizeRate(agent.delegation_success_rate).toFixed(0)}%`} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <NodeStat label="stake" value={compactLamports(agent.stake_amount)} />
        <NodeStat label="lat" value={`${agent.avg_latency_ms}ms`} />
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
  const avgSuccessRate = average(agents.map((agent) => normalizeRate(agent.success_rate)));
  const avgDelegationRate = average(agents.map((agent) => normalizeRate(agent.delegation_success_rate)));
  const latencyPressure = clamp(average(results.map((result) => result.skill.estimated_latency_ms)) / 150, 0, 100);
  const totalPayment = tasks.reduce((sum, task) => sum + Number(task.payment_lamports), 0).toFixed(0);
  const openEscrowTasks = tasks.filter((task) => Boolean(task.escrow_account) && !task.settlement_tx_signature && task.status !== "cancelled").length;
  const disputedTasks = tasks.filter((task) => task.status === "disputed" || task.status === "failed" || task.status === "expired").length;
  return { avgReputation, avgQuality, avgSuccessRate, avgDelegationRate, latencyPressure, totalPayment, openEscrowTasks, disputedTasks };
}

function lifecycleIndex(status: TaskStatus) {
  if (status === "failed" || status === "expired" || status === "disputed" || status === "cancelled") {
    return LIFECYCLE.indexOf("submitted");
  }
  return LIFECYCLE.indexOf(status);
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

function taskPackPayload(scenario: DemoScenario) {
  if (!isTaskPackScenario(scenario)) {
    return {};
  }
  return {
    task_pack: "crypto_launch_market_intelligence",
    project_context: scenario.projectContext,
    research_questions: scenario.researchQuestions,
    acceptance_criteria: scenario.acceptanceCriteria,
    permission_scope: scenario.permissionScope,
    delegation_budget_lamports: scenario.delegationBudgetLamports,
    privacy_level: scenario.privacyLevel,
    review_window_hours: scenario.reviewWindowHours,
    settlement_mode: scenario.settlementMode,
  };
}

function childTaskPayload(scenario: DemoScenario, specialist: DemoScenario["specialists"][number]) {
  if (!isTaskPackScenario(scenario)) {
    return {};
  }
  return {
    task_pack: `${specialist.capability}_evidence`,
    project_context: scenario.projectContext,
    research_questions: scenario.researchQuestions,
    acceptance_criteria: [`Produce evidence for ${specialist.capability}`, "Attach artifact reference with hash and safety label"],
    permission_scope: scenario.permissionScope.filter((permission) => permission !== "read_child_task_details"),
    privacy_level: scenario.privacyLevel,
    review_window_hours: scenario.reviewWindowHours,
    settlement_mode: scenario.settlementMode,
  };
}

function artifactReference(scenarioSlug: string, kind: string, taskId: string) {
  return {
    kind,
    task_id: taskId,
    hash: `sha256:${stableHash(`${scenarioSlug}:${kind}:${taskId}`)}`,
    safety_label: "validated",
  };
}

function isTaskPackScenario(scenario: DemoScenario): scenario is TaskPackScenario {
  return "projectContext" in scenario;
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
        task_pack: { type: "string" },
        project_context: { type: "object" },
        research_questions: { type: "array" },
        acceptance_criteria: { type: "array" },
        permission_scope: { type: "array" },
        delegation_budget_lamports: { type: "string" },
        privacy_level: { type: "string" },
        review_window_hours: { type: "number" },
        settlement_mode: { type: "string" },
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
          task_pack: { type: "string" },
          project_context: { type: "object" },
          research_questions: { type: "array" },
          acceptance_criteria: { type: "array" },
          permission_scope: { type: "array" },
          privacy_level: { type: "string" },
          review_window_hours: { type: "number" },
          settlement_mode: { type: "string" },
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

function artifactTone(status: TaskDetailDto["proof"]["artifacts"]["references"][number]["validation_status"]) {
  if (status === "validated") {
    return toneColor("success");
  }
  if (status === "unsafe") {
    return toneColor("danger");
  }
  if (status === "private_runtime") {
    return toneColor("warning");
  }
  return toneColor("info");
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeRate(value: number) {
  return value <= 1 ? value * 100 : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatLamports(value: string) {
  return `${Number(value).toLocaleString()} lamports`;
}

function projectLine(projectContext: Record<string, unknown> | undefined) {
  if (!projectContext) {
    return "No project context declared";
  }
  const project = typeof projectContext.project_name === "string" ? projectContext.project_name : "Unnamed project";
  const token = typeof projectContext.token_symbol === "string" ? projectContext.token_symbol : "n/a";
  const chain = typeof projectContext.target_chain === "string" ? projectContext.target_chain : "n/a";
  return `${project} / ${token} / ${chain}`;
}

function settlementLabel(proof: NonNullable<TaskDetailDto["proof"]>) {
  if (proof.settlement.released) {
    return "payout released";
  }
  if (proof.settlement.refunded) {
    return "hirer refunded";
  }
  if (proof.settlement.disputed) {
    return "in dispute";
  }
  return proof.escrow.locked ? "awaiting review" : "unfunded";
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
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
