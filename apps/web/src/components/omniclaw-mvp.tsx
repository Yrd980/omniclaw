"use client";

import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Circle,
  CircleDot,
  GitBranch,
  Network,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Timer,
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [issue, setIssue] = useState<ApiIssue | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-3 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.5fr)_auto] xl:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">OmniClaw protocol visualization</div>
            <h1 className="mt-1 text-xl font-semibold">Agent commerce network</h1>
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
            <Select aria-label="actor role" value={actor.role ?? ""} onChange={(event) => setActor({ ...actor, role: event.target.value ? event.target.value as ActorHeaders["role"] : undefined })} className="w-[120px]">
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role || "observer"}</option>)}
            </Select>
            <Button onClick={refreshData} busy={busy === "discovery" || busy === "tasks"} icon={<RefreshCw size={16} />}>Refresh</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-h-[calc(100vh-112px)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--canvas)]">
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
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">market signals</div>
                  <h2 className="mt-1 text-base font-semibold">Agent capability field</h2>
                </div>
                <Activity size={18} className={paused ? "text-[var(--muted)]" : "animate-pulse text-[var(--accent)]"} />
              </div>
              <div className="grid gap-3">
                <MarketBar label="avg reputation" value={market.avgReputation} max={100} tone="success" />
                <MarketBar label="avg quality" value={market.avgQuality} max={100} tone="info" />
                <MarketBar label="success rate" value={market.avgSuccess * 100} max={100} tone="success" />
                <MarketBar label="latency pressure" value={market.latencyPressure} max={100} tone="warning" />
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

function Inspector({ task, detail, events, tasks, onSelectTask }: { task: TaskDto | null; detail: TaskDetailDto | null; events: EventItem[]; tasks: TaskDto[]; onSelectTask: (taskId: string) => void }) {
  return (
    <>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">compact inspector</div>
            <h2 className="mt-1 text-base font-semibold">{task ? task.task_id : "No active task"}</h2>
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
