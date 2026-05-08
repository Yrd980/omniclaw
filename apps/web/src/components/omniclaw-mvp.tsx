"use client";

import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { AlertTriangle, Check, CircleDollarSign, GitBranch, Plus, RefreshCw, Search, Send, ShieldCheck, X } from "lucide-react";
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
  type CreateTaskInput,
  type DiscoverAgentsFilters,
  type DiscoveryResultDto,
  type ListTasksFilters,
  type RegisterAgentInput,
  type RegisterSkillInput,
  type ResolveTaskInput,
  type SkillDto,
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

const API_URL = process.env.NEXT_PUBLIC_OMNICLAW_API_URL ?? "http://localhost:3000";

const AGENT_STATUSES: AgentStatus[] = ["active", "paused", "suspended"];
const TASK_STATUSES: TaskStatus[] = ["created", "escrow_locked", "accepted", "in_progress", "submitted", "completed", "failed", "expired", "disputed", "cancelled"];
const ROLE_OPTIONS: Array<NonNullable<ActorHeaders["role"]> | ""> = ["", "admin", "evaluator"];

const DEFAULT_AGENT: RegisterAgentInput = {
  publisher_wallet: "wallet_operator",
  name: "Market Research Agent",
  description: "Finds specialist workers and coordinates research tasks.",
  status: "active",
  reputation_score: 88,
  success_rate: 0.94,
  avg_latency_ms: 5200,
  quality_score: 90,
  delegation_success_rate: 0.91,
  historical_earnings_lamports: "142000000000",
  stake_amount: "500000000",
};

const DEFAULT_SKILL: RegisterSkillInput & { agent_id: string } = {
  agent_id: "",
  name: "market_research",
  description: "Collects, analyzes, and summarizes market data.",
  input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
  output_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
  base_price_lamports: "50000000",
  estimated_latency_ms: 10000,
  required_permissions: ["web_access"],
};

const DEFAULT_RESULT = {
  result_payload: { summary: "Completed from the local MVP console." },
  artifacts: [],
};

export function OmniClawMvp({ client: injectedClient }: OmniClawMvpProps) {
  const [apiUrl, setApiUrl] = useState(API_URL);
  const client = useMemo(() => injectedClient ?? createOmniClawClient({ baseUrl: apiUrl }), [apiUrl, injectedClient]);
  const [actor, setActor] = useState<ActorHeaders>({ wallet: "wallet_operator", agentId: "", role: undefined });
  const [filters, setFilters] = useState<DiscoverAgentsFilters>({ capability: "", status: "active" });
  const [results, setResults] = useState<DiscoveryResultDto[]>([]);
  const [selected, setSelected] = useState<DiscoveryResultDto | null>(null);
  const [agentForm, setAgentForm] = useState(DEFAULT_AGENT);
  const [skillForm, setSkillForm] = useState(DEFAULT_SKILL);
  const [registeredAgents, setRegisteredAgents] = useState<AgentDto[]>([]);
  const [registeredSkills, setRegisteredSkills] = useState<SkillDto[]>([]);
  const [taskForm, setTaskForm] = useState(() => defaultTaskForm());
  const [taskFilters, setTaskFilters] = useState<ListTasksFilters>({});
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [detail, setDetail] = useState<TaskDetailDto | null>(null);
  const [graph, setGraph] = useState<TaskGraphDto | null>(null);
  const [resultJson, setResultJson] = useState(JSON.stringify(DEFAULT_RESULT, null, 2));
  const [resolution, setResolution] = useState<ResolveTaskInput>({ resolution: "completed", quality_score: 92, review_score: 5 });
  const [busy, setBusy] = useState<string | null>(null);
  const [issue, setIssue] = useState<ApiIssue | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeActor = useMemo(() => compactActor(actor), [actor]);

  const run = useCallback(async <T,>(label: string, action: () => Promise<T>) => {
    setBusy(label);
    setIssue(null);
    setNotice(null);
    try {
      return await action();
    } catch (error) {
      setIssue(toIssue(error));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const refreshDiscovery = useCallback(async () => {
    const response = await run("discovery", () => client.discoverAgents(cleanFilters(filters), activeActor));
    if (response) {
      setResults(response.results);
      if (!selected && response.results[0]) {
        selectResult(response.results[0]);
      }
    }
  }, [activeActor, client, filters, run, selected]);

  const refreshTasks = useCallback(async () => {
    const response = await run("tasks", () => client.listTasks(cleanTaskFilters(taskFilters), activeActor));
    if (response) {
      setTasks(response.tasks);
    }
  }, [activeActor, client, run, taskFilters]);

  const loadDetail = useCallback(async (taskId: string) => {
    const response = await run("detail", () => client.getTaskDetail(taskId, activeActor));
    if (response) {
      setDetail(response);
      const nextGraph = await run("graph", () => client.getTaskGraph(taskId, activeActor));
      if (nextGraph) {
        setGraph(nextGraph);
      }
    }
  }, [activeActor, client, run]);

  useEffect(() => {
    void refreshDiscovery();
  }, []);

  useEffect(() => {
    void refreshTasks();
  }, []);

  const selectResult = (result: DiscoveryResultDto) => {
    setSelected(result);
    setTaskForm((current) => ({
      ...current,
      worker_agent_id: result.agent.agent_id,
      skill_id: result.skill.skill_id,
      payment_lamports: result.skill.base_price_lamports,
    }));
    setSkillForm((current) => ({ ...current, agent_id: result.agent.agent_id }));
  };

  const registerAgent = async () => {
    const agent = await run("register-agent", () => client.registerAgent(agentForm, { ...activeActor, wallet: agentForm.publisher_wallet }));
    if (agent) {
      setRegisteredAgents((current) => [agent, ...current]);
      setActor((current) => ({ ...current, wallet: agent.publisher_wallet, agentId: current.agentId || agent.agent_id }));
      setSkillForm((current) => ({ ...current, agent_id: agent.agent_id }));
      setNotice(`Registered ${agent.agent_id}`);
    }
  };

  const registerSkill = async () => {
    const { agent_id, ...input } = skillForm;
    const skill = await run("register-skill", () => client.registerSkill(agent_id, input, { ...activeActor, wallet: actor.wallet || agentForm.publisher_wallet }));
    if (skill) {
      setRegisteredSkills((current) => [skill, ...current]);
      setNotice(`Registered ${skill.skill_id}`);
      await refreshDiscovery();
    }
  };

  const createTask = async () => {
    const parsed = parseObject(taskForm.task_payload, "task_payload");
    if (!parsed.ok) {
      setIssue(parsed.issue);
      return;
    }
    const input: CreateTaskInput = {
      parent_task_id: taskForm.parent_task_id || null,
      hirer_agent_id: taskForm.hirer_agent_id,
      worker_agent_id: taskForm.worker_agent_id,
      skill_id: taskForm.skill_id,
      task_payload: parsed.value,
      payment_lamports: taskForm.payment_lamports,
      deadline: taskForm.deadline,
    };
    const task = await run("create-task", () => client.createTask(input, { ...activeActor, agentId: input.hirer_agent_id }));
    if (task) {
      setNotice(`Created ${task.task_id} with ${task.status} escrow state`);
      setActor((current) => ({ ...current, agentId: input.hirer_agent_id }));
      await refreshTasks();
      await loadDetail(task.task_id);
    }
  };

  const taskAction = async (kind: "accept" | "reject" | "expire" | "submit" | "resolve") => {
    if (!detail) {
      return;
    }
    const id = detail.task.task_id;
    if (kind === "accept") {
      await run("accept", () => client.acceptTask(id, { ...activeActor, agentId: detail.task.worker_agent_id }));
    }
    if (kind === "reject") {
      await run("reject", () => client.rejectTask(id, { ...activeActor, agentId: detail.task.worker_agent_id }));
    }
    if (kind === "expire") {
      await run("expire", () => client.expireTask(id, { ...activeActor, role: actor.role || "admin" }));
    }
    if (kind === "submit") {
      const parsed = parseObject(resultJson, "result_payload");
      if (!parsed.ok) {
        setIssue(parsed.issue);
        return;
      }
      const artifacts = Array.isArray(parsed.value.artifacts) ? parsed.value.artifacts : [];
      const result_payload = typeof parsed.value.result_payload === "object" && parsed.value.result_payload !== null && !Array.isArray(parsed.value.result_payload)
        ? parsed.value.result_payload as Record<string, unknown>
        : parsed.value;
      await run("submit", () => client.submitResult(id, { result_payload, artifacts }, { ...activeActor, agentId: detail.task.worker_agent_id }));
    }
    if (kind === "resolve") {
      await run("resolve", () => client.resolveTask(id, resolution, { ...activeActor, agentId: detail.task.hirer_agent_id }));
    }
    await refreshTasks();
    await loadDetail(id);
  };

  const flowNodes = useMemo<Node[]>(() => {
    if (!graph) {
      return [];
    }
    return graph.nodes.map((node, index) => ({
      id: node.taskId,
      position: { x: 40 + (index % 3) * 300, y: 40 + Math.floor(index / 3) * 170 },
      data: {
        label: (
          <div className="min-w-[230px] rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-left shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-xs">{node.taskId}</span>
              <StatusBadge status={node.status} />
            </div>
            <div className="space-y-1 text-xs text-[var(--muted)]">
              <div>worker: {node.workerAgentId}</div>
              <div>payment: {formatLamports(node.paymentLamports)}</div>
              <div>payout: {formatLamports(node.workerPayoutLamports)}</div>
              <div>deadline: {formatDate(node.deadline)}</div>
            </div>
          </div>
        ),
      },
      type: "default",
    }));
  }, [graph]);

  const flowEdges = useMemo<Edge[]>(() => graph?.edges.map((edge) => ({
    id: `${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    animated: true,
  })) ?? [], [graph]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-[1520px] flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">OmniClaw MVP</div>
            <h1 className="mt-1 text-2xl font-semibold">Marketplace and task console</h1>
          </div>
          <div className="grid gap-2 sm:grid-cols-4 lg:w-[760px]">
            <Field label="API URL">
              <Input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} disabled={Boolean(injectedClient)} />
            </Field>
            <Field label="x-wallet">
              <Input value={actor.wallet ?? ""} onChange={(event) => setActor({ ...actor, wallet: event.target.value })} />
            </Field>
            <Field label="x-agent-id">
              <Input value={actor.agentId ?? ""} onChange={(event) => setActor({ ...actor, agentId: event.target.value })} />
            </Field>
            <Field label="x-role">
              <Select value={actor.role ?? ""} onChange={(event) => setActor({ ...actor, role: event.target.value ? event.target.value as ActorHeaders["role"] : undefined })}>
                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role || "none"}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1520px] gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="space-y-5">
          <Panel title="Discovery" action={<Button onClick={refreshDiscovery} busy={busy === "discovery"} icon={<Search size={16} />}>Search</Button>}>
            <div className="grid gap-3 md:grid-cols-5">
              <Field label="capability">
                <Input value={filters.capability ?? ""} onChange={(event) => setFilters({ ...filters, capability: event.target.value })} placeholder="market_research" />
              </Field>
              <Field label="status">
                <Select value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: event.target.value as AgentStatus || undefined })}>
                  <option value="">any</option>
                  {AGENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </Field>
              <Field label="reputation_gt">
                <Input value={filters.reputation_gt ?? ""} onChange={(event) => setFilters({ ...filters, reputation_gt: event.target.value })} />
              </Field>
              <Field label="latency_lt_ms">
                <Input value={filters.latency_lt_ms ?? ""} onChange={(event) => setFilters({ ...filters, latency_lt_ms: event.target.value })} />
              </Field>
              <Field label="max_price_lamports">
                <Input value={filters.max_price_lamports ?? ""} onChange={(event) => setFilters({ ...filters, max_price_lamports: event.target.value })} />
              </Field>
            </div>

            <div className="mt-4 overflow-x-auto rounded-md border border-[var(--border)]">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead className="bg-[var(--panel-strong)] text-left text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                  <tr>
                    <Th>agent</Th>
                    <Th>skill</Th>
                    <Th>rank</Th>
                    <Th>reputation</Th>
                    <Th>latency</Th>
                    <Th>price</Th>
                    <Th>action</Th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={`${result.agent.agent_id}-${result.skill.skill_id}`} className="border-t border-[var(--border)]">
                      <Td>
                        <div className="font-medium">{result.agent.name}</div>
                        <div className="font-mono text-xs text-[var(--muted)]">{result.agent.agent_id}</div>
                      </Td>
                      <Td>
                        <div>{result.skill.name}</div>
                        <div className="text-xs text-[var(--muted)]">{result.skill.description}</div>
                      </Td>
                      <Td>
                        <div className="font-medium">{result.ranking.score.toFixed(2)}</div>
                        <div className="text-xs text-[var(--muted)]">match {result.ranking.skillMatch.toFixed(2)} · price {result.ranking.price.toFixed(2)}</div>
                      </Td>
                      <Td>{result.agent.reputation_score}</Td>
                      <Td>{result.skill.estimated_latency_ms} ms</Td>
                      <Td>{formatLamports(result.skill.base_price_lamports)}</Td>
                      <Td><Button variant="secondary" onClick={() => selectResult(result)}>Select</Button></Td>
                    </tr>
                  ))}
                  {results.length === 0 && <EmptyRow columns={7} text="No agents discovered yet. Register an agent and skill, then search." />}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Register agent and skill" action={<Button onClick={registerAgent} busy={busy === "register-agent"} icon={<Plus size={16} />}>Agent</Button>}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-3">
                <Field label="publisher_wallet">
                  <Input value={agentForm.publisher_wallet} onChange={(event) => setAgentForm({ ...agentForm, publisher_wallet: event.target.value })} />
                </Field>
                <Field label="name">
                  <Input value={agentForm.name} onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })} />
                </Field>
                <Field label="description">
                  <Textarea value={agentForm.description} onChange={(event) => setAgentForm({ ...agentForm, description: event.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="reputation_score"><Input type="number" value={agentForm.reputation_score ?? 0} onChange={(event) => setAgentForm({ ...agentForm, reputation_score: Number(event.target.value) })} /></Field>
                  <Field label="avg_latency_ms"><Input type="number" value={agentForm.avg_latency_ms ?? 0} onChange={(event) => setAgentForm({ ...agentForm, avg_latency_ms: Number(event.target.value) })} /></Field>
                </div>
              </div>
              <div className="grid gap-3">
                <Field label="agent_id for skill">
                  <Input value={skillForm.agent_id} onChange={(event) => setSkillForm({ ...skillForm, agent_id: event.target.value })} />
                </Field>
                <Field label="skill name">
                  <Input value={skillForm.name} onChange={(event) => setSkillForm({ ...skillForm, name: event.target.value })} />
                </Field>
                <Field label="skill description">
                  <Textarea value={skillForm.description} onChange={(event) => setSkillForm({ ...skillForm, description: event.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="base_price_lamports"><Input value={skillForm.base_price_lamports} onChange={(event) => setSkillForm({ ...skillForm, base_price_lamports: event.target.value })} /></Field>
                  <Field label="estimated_latency_ms"><Input type="number" value={skillForm.estimated_latency_ms} onChange={(event) => setSkillForm({ ...skillForm, estimated_latency_ms: Number(event.target.value) })} /></Field>
                </div>
                <Button onClick={registerSkill} busy={busy === "register-skill"} icon={<ShieldCheck size={16} />}>Register skill</Button>
              </div>
            </div>
            {(registeredAgents.length > 0 || registeredSkills.length > 0) && (
              <div className="mt-4 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                <pre className="overflow-auto rounded-md bg-[var(--panel-strong)] p-3">{JSON.stringify(registeredAgents[0] ?? null, null, 2)}</pre>
                <pre className="overflow-auto rounded-md bg-[var(--panel-strong)] p-3">{JSON.stringify(registeredSkills[0] ?? null, null, 2)}</pre>
              </div>
            )}
          </Panel>

          <Panel title="Create task" action={<Button onClick={createTask} busy={busy === "create-task"} icon={<CircleDollarSign size={16} />}>Create</Button>}>
            {selected && (
              <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel)] p-3 text-sm">
                Selected worker: <b>{selected.agent.name}</b> · skill <b>{selected.skill.name}</b> · price {formatLamports(selected.skill.base_price_lamports)}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="hirer_agent_id"><Input aria-label="create hirer_agent_id" value={taskForm.hirer_agent_id} onChange={(event) => setTaskForm({ ...taskForm, hirer_agent_id: event.target.value })} /></Field>
              <Field label="worker_agent_id"><Input aria-label="create worker_agent_id" value={taskForm.worker_agent_id} onChange={(event) => setTaskForm({ ...taskForm, worker_agent_id: event.target.value })} /></Field>
              <Field label="skill_id"><Input aria-label="create skill_id" value={taskForm.skill_id} onChange={(event) => setTaskForm({ ...taskForm, skill_id: event.target.value })} /></Field>
              <Field label="payment_lamports"><Input value={taskForm.payment_lamports} onChange={(event) => setTaskForm({ ...taskForm, payment_lamports: event.target.value })} /></Field>
              <Field label="parent_task_id"><Input value={taskForm.parent_task_id} onChange={(event) => setTaskForm({ ...taskForm, parent_task_id: event.target.value })} /></Field>
              <Field label="deadline"><Input type="datetime-local" value={toLocalDateTime(taskForm.deadline)} onChange={(event) => setTaskForm({ ...taskForm, deadline: new Date(event.target.value).toISOString() })} /></Field>
              <Field label="payload JSON" className="md:col-span-2">
                <Textarea rows={7} value={taskForm.task_payload} onChange={(event) => setTaskForm({ ...taskForm, task_payload: event.target.value })} />
              </Field>
            </div>
          </Panel>
        </section>

        <section className="space-y-5">
          {(issue || notice) && <Feedback issue={issue} notice={notice} />}

          <Panel title="Tasks" action={<Button onClick={refreshTasks} busy={busy === "tasks"} icon={<RefreshCw size={16} />}>Refresh</Button>}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="worker_agent_id"><Input value={taskFilters.worker_agent_id ?? ""} onChange={(event) => setTaskFilters({ ...taskFilters, worker_agent_id: event.target.value || undefined })} /></Field>
              <Field label="hirer_agent_id"><Input value={taskFilters.hirer_agent_id ?? ""} onChange={(event) => setTaskFilters({ ...taskFilters, hirer_agent_id: event.target.value || undefined })} /></Field>
              <Field label="status">
                <Select value={taskFilters.status ?? ""} onChange={(event) => setTaskFilters({ ...taskFilters, status: event.target.value as TaskStatus || undefined })}>
                  <option value="">any</option>
                  {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-4 max-h-[360px] overflow-auto rounded-md border border-[var(--border)]">
              {tasks.map((task) => (
                <button key={task.task_id} className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-3 text-left text-sm hover:bg-[var(--panel)]" onClick={() => loadDetail(task.task_id)}>
                  <span>
                    <span className="block font-mono text-xs">{task.task_id}</span>
                    <span className="text-xs text-[var(--muted)]">{task.worker_agent_id} · {formatLamports(task.payment_lamports)}</span>
                  </span>
                  <StatusBadge status={task.status} />
                </button>
              ))}
              {tasks.length === 0 && <div className="p-4 text-sm text-[var(--muted)]">No tasks match the current filters.</div>}
            </div>
          </Panel>

          <Panel title="Task detail" action={detail ? <span className="font-mono text-xs text-[var(--muted)]">{detail.task.task_id}</span> : null}>
            {detail ? (
              <div className="space-y-4">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <Metric label="status" value={<StatusBadge status={detail.task.status} />} />
                  <Metric label="escrow" value={detail.task.escrow_account ?? "none"} />
                  <Metric label="worker payout" value={formatLamports(detail.task.worker_payout_lamports)} />
                  <Metric label="deadline" value={formatDate(detail.task.deadline)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={Boolean(busy)} onClick={() => taskAction("accept")} busy={busy === "accept"} icon={<Check size={16} />}>Accept</Button>
                  <Button variant="secondary" disabled={Boolean(busy)} onClick={() => taskAction("submit")} busy={busy === "submit"} icon={<Send size={16} />}>Submit result</Button>
                  <Button variant="secondary" disabled={Boolean(busy)} onClick={() => taskAction("resolve")} busy={busy === "resolve"} icon={<ShieldCheck size={16} />}>Resolve</Button>
                  <Button variant="secondary" disabled={Boolean(busy)} onClick={() => taskAction("reject")} busy={busy === "reject"} icon={<X size={16} />}>Reject</Button>
                  <Button variant="secondary" disabled={Boolean(busy)} onClick={() => taskAction("expire")} busy={busy === "expire"} icon={<AlertTriangle size={16} />}>Expire</Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="submitResult JSON">
                    <Textarea rows={6} value={resultJson} onChange={(event) => setResultJson(event.target.value)} />
                  </Field>
                  <div className="grid gap-3">
                    <Field label="resolution">
                      <Select value={resolution.resolution} onChange={(event) => setResolution({ ...resolution, resolution: event.target.value as ResolveTaskInput["resolution"] })}>
                        <option value="completed">completed</option>
                        <option value="failed">failed</option>
                        <option value="disputed">disputed</option>
                      </Select>
                    </Field>
                    <Field label="quality_score"><Input type="number" value={resolution.quality_score ?? ""} onChange={(event) => setResolution({ ...resolution, quality_score: Number(event.target.value) })} /></Field>
                    <Field label="review_score"><Input type="number" value={resolution.review_score ?? ""} onChange={(event) => setResolution({ ...resolution, review_score: Number(event.target.value) })} /></Field>
                  </div>
                </div>
                <Timeline title="settlement_events" items={detail.settlement_events} />
                <Timeline title="reputation_events" items={detail.reputation_events} />
                <pre className="max-h-[320px] overflow-auto rounded-md bg-[var(--panel-strong)] p-3 text-xs">{JSON.stringify(detail, null, 2)}</pre>
              </div>
            ) : (
              <div className="text-sm text-[var(--muted)]">Select a task to inspect detail, result, settlement events, and reputation events.</div>
            )}
          </Panel>

          <Panel title="Task graph" action={<GitBranch size={16} className="text-[var(--muted)]" />}>
            <div className="h-[430px] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)]">
              {graph && flowNodes.length > 0 ? (
                <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
                  <Background />
                  <Controls />
                </ReactFlow>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">Graph appears after a task is selected.</div>
              )}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--background)]">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1 text-xs font-medium text-[var(--muted)] ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: TaskStatus | AgentStatus }) {
  const color = status === "completed" || status === "active" ? "var(--success)" : status === "failed" || status === "expired" || status === "cancelled" || status === "suspended" ? "var(--danger)" : status === "submitted" || status === "disputed" ? "var(--warning)" : "var(--info)";
  return <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium" style={{ borderColor: color, color }}>{status}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-top">{children}</td>;
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="px-3 py-6 text-center text-sm text-[var(--muted)]">{text}</td></tr>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-md bg-[var(--panel)] p-3"><div className="mb-1 text-xs text-[var(--muted)]">{label}</div><div className="break-all text-sm font-medium">{value}</div></div>;
}

function Timeline({ title, items }: { title: string; items: unknown[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{title}</div>
      <pre className="max-h-[190px] overflow-auto rounded-md bg-[var(--panel-strong)] p-3 text-xs">{JSON.stringify(items, null, 2)}</pre>
    </div>
  );
}

function Feedback({ issue, notice }: { issue: ApiIssue | null; notice: string | null }) {
  if (issue) {
    return (
      <div role="alert" className="rounded-md border border-[var(--danger)] bg-[oklch(0.97_0.018_28)] p-4 text-sm">
        <div className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> API error envelope</div>
        <div className="grid gap-1 font-mono text-xs">
          <span>code: {issue.code}</span>
          <span>message: {issue.message}</span>
          <span>path: {issue.path ?? "n/a"}</span>
          <span>details: {JSON.stringify(issue.details)}</span>
        </div>
      </div>
    );
  }
  return notice ? <div className="rounded-md border border-[var(--success)] bg-[oklch(0.97_0.02_150)] p-4 text-sm">{notice}</div> : null;
}

function defaultTaskForm() {
  return {
    parent_task_id: "",
    hirer_agent_id: "",
    worker_agent_id: "",
    skill_id: "",
    task_payload: JSON.stringify({ topic: "OmniClaw marketplace discovery" }, null, 2),
    payment_lamports: "50000000",
    deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
  };
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

function parseObject(text: string, field: string): { ok: true; value: Record<string, unknown> } | { ok: false; issue: ApiIssue } {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, issue: { code: "INVALID_JSON", message: `${field} must be a JSON object`, details: value } };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, issue: { code: "INVALID_JSON", message: error instanceof Error ? error.message : "invalid JSON", details: { field } } };
  }
}

function toIssue(error: unknown): ApiIssue {
  if (error instanceof OmniClawApiError) {
    return { status: error.status, code: error.code, message: error.message, path: error.path, details: error.details };
  }
  return { code: "CLIENT_ERROR", message: error instanceof Error ? error.message : "unknown client error", details: null };
}

function formatLamports(value: string) {
  return `${Number(value).toLocaleString()} lamports`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
