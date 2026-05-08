import asyncio

from omniclaw_agent_runtime.contracts import RuntimeAcceptedTaskPayload
from omniclaw_agent_runtime.graphs import LangGraphRuntimeGraph, LinearRuntimeGraph
from omniclaw_agent_runtime.providers import ProviderResult
from omniclaw_agent_runtime.sandbox import SandboxContext


class Provider:
    name = "graph-test"

    def __init__(self) -> None:
        self.executed = False

    async def execute(self, payload: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        self.executed = True
        return ProviderResult(result_payload={"task_id": payload.task_id, "sandbox": sandbox_metadata or {}})


def test_linear_graph_delegates_to_provider() -> None:
    provider = Provider()
    graph = LinearRuntimeGraph()
    payload = RuntimeAcceptedTaskPayload.from_mapping(
        {
            "task_id": "task-1",
            "parent_task_id": None,
            "hirer_agent_id": "hirer-1",
            "worker_agent_id": "worker-1",
            "skill_id": "skill-1",
            "task_payload": {},
            "payment_lamports": "1000",
            "worker_payout_lamports": "900",
            "deadline": "2026-05-08T12:00:00.000Z",
            "accepted_at": None,
            "callback": {
                "method": "POST",
                "path": "/tasks/task-1/result",
                "actor_headers": {"x-agent-id": "worker-1"},
            },
        }
    )

    result = asyncio.run(graph.run(payload, provider, SandboxContext(sandbox_id="sandbox-1", metadata={})))

    assert provider.executed is True
    assert result.result_payload == {"task_id": "task-1", "sandbox": {}}


def test_langgraph_runtime_graph_delegates_to_provider_with_sandbox_metadata() -> None:
    provider = Provider()
    graph = LangGraphRuntimeGraph()
    payload = RuntimeAcceptedTaskPayload.from_mapping(
        {
            "task_id": "task-1",
            "parent_task_id": None,
            "hirer_agent_id": "hirer-1",
            "worker_agent_id": "worker-1",
            "skill_id": "skill-1",
            "task_payload": {},
            "payment_lamports": "1000",
            "worker_payout_lamports": "900",
            "deadline": "2026-05-08T12:00:00.000Z",
            "accepted_at": None,
            "callback": {
                "method": "POST",
                "path": "/tasks/task-1/result",
                "actor_headers": {"x-agent-id": "worker-1"},
            },
        }
    )

    result = asyncio.run(graph.run(payload, provider, SandboxContext(sandbox_id="sandbox-1", metadata={"boundary": "noop"})))

    assert provider.executed is True
    assert result.result_payload == {"task_id": "task-1", "sandbox": {"boundary": "noop"}}
