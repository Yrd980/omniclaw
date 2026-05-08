import asyncio

import pytest

from omniclaw_agent_runtime.contracts import RuntimeAcceptedTaskPayload
from omniclaw_agent_runtime.orchestrator import RuntimeOrchestrator
from omniclaw_agent_runtime.providers import ProviderExecutionError, ProviderResult
from omniclaw_agent_runtime.sandbox import SandboxContext
from omniclaw_agent_runtime.states import ExecutionState


def payload() -> RuntimeAcceptedTaskPayload:
    return RuntimeAcceptedTaskPayload.from_mapping(
        {
            "task_id": "task-1",
            "parent_task_id": None,
            "hirer_agent_id": "hirer-1",
            "worker_agent_id": "worker-1",
            "skill_id": "skill-1",
            "task_payload": {"prompt": "hello"},
            "payment_lamports": "1000",
            "worker_payout_lamports": "900",
            "deadline": "2026-05-08T12:00:00.000Z",
            "accepted_at": "2026-05-08T11:00:00.000Z",
            "callback": {
                "method": "POST",
                "path": "/tasks/task-1/result",
                "actor_headers": {"x-agent-id": "worker-1"},
            },
        }
    )


class SuccessfulProvider:
    name = "test-provider"

    async def execute(self, task: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        return ProviderResult(
            result_payload={"task_id": task.task_id, "ok": True},
            artifacts=[{"kind": "text", "value": "done"}],
        )


class FailingProvider:
    name = "test-provider"

    async def execute(self, task: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        raise ProviderExecutionError("rate limited", code="provider_http_error", retryable=True)


class SlowProvider:
    name = "test-provider"

    async def execute(self, task: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        await asyncio.sleep(10)
        return ProviderResult(result_payload={"ok": True})


class TrackingSandbox:
    def __init__(self) -> None:
        self.prepared = False
        self.cleaned = False

    async def prepare(self, task: RuntimeAcceptedTaskPayload) -> SandboxContext:
        self.prepared = True
        return SandboxContext(sandbox_id="sandbox-1", metadata={"task_id": task.task_id})

    async def cleanup(self, context: SandboxContext) -> None:
        self.cleaned = True


class PrepareFailingSandbox:
    async def prepare(self, task: RuntimeAcceptedTaskPayload) -> SandboxContext:
        raise RuntimeError("sandbox prepare failed")

    async def cleanup(self, context: SandboxContext) -> None:
        raise AssertionError("cleanup should not run when prepare fails")


class CleanupFailingSandbox:
    async def prepare(self, task: RuntimeAcceptedTaskPayload) -> SandboxContext:
        return SandboxContext(sandbox_id="sandbox-1", metadata={"task_id": task.task_id})

    async def cleanup(self, context: SandboxContext) -> None:
        raise RuntimeError("sandbox cleanup failed")


def test_dispatch_generates_callback_payload_and_lifecycle_events() -> None:
    sandbox = TrackingSandbox()
    orchestrator = RuntimeOrchestrator(
        SuccessfulProvider(),
        sandbox=sandbox,
        clock=lambda: "2026-05-08T00:00:00+00:00",
    )

    response = asyncio.run(orchestrator.dispatch(payload()))
    callback_payload = orchestrator.callback_payload(response)

    assert response.to_dict() == {
        "accepted": True,
        "result_payload": {"task_id": "task-1", "ok": True},
        "artifacts": [{"kind": "text", "value": "done"}],
    }
    assert callback_payload.to_dict() == {
        "result_payload": {"task_id": "task-1", "ok": True},
        "artifacts": [{"kind": "text", "value": "done"}],
    }
    assert [event.state for event in orchestrator.events] == [
        ExecutionState.DISPATCHED,
        ExecutionState.IN_PROGRESS,
        ExecutionState.COMPLETED,
    ]
    assert sandbox.prepared is True
    assert sandbox.cleaned is True


def test_sandbox_prepare_failure_maps_to_failed_result() -> None:
    orchestrator = RuntimeOrchestrator(SuccessfulProvider(), sandbox=PrepareFailingSandbox())

    response = asyncio.run(orchestrator.dispatch(payload()))

    assert response.accepted is False
    assert response.result_payload == {
        "error": "runtime_sandbox_prepare_failed",
        "message": "sandbox prepare failed",
        "retryable": True,
    }
    assert [event.state for event in orchestrator.events] == [
        ExecutionState.DISPATCHED,
        ExecutionState.FAILED,
    ]
    assert orchestrator.events[-1].reason == "sandbox_prepare_error"


def test_sandbox_cleanup_failure_does_not_mask_completed_result() -> None:
    orchestrator = RuntimeOrchestrator(SuccessfulProvider(), sandbox=CleanupFailingSandbox())

    response = asyncio.run(orchestrator.dispatch(payload()))

    assert response.accepted is True
    assert response.result_payload == {"task_id": "task-1", "ok": True}
    assert [event.state for event in orchestrator.events] == [
        ExecutionState.DISPATCHED,
        ExecutionState.IN_PROGRESS,
        ExecutionState.COMPLETED,
        ExecutionState.FAILED,
    ]
    assert orchestrator.events[-1].reason == "sandbox_cleanup_error"
    assert orchestrator.events[-1].detail == {
        "sandbox_id": "sandbox-1",
        "message": "sandbox cleanup failed",
    }


def test_provider_failure_maps_to_failed_state_and_retryable_result() -> None:
    orchestrator = RuntimeOrchestrator(FailingProvider())

    response = asyncio.run(orchestrator.dispatch(payload()))

    assert response.accepted is False
    assert response.result_payload == {
        "error": "provider_http_error",
        "message": "rate limited",
        "retryable": True,
    }
    assert orchestrator.events[-1].state == ExecutionState.FAILED
    assert orchestrator.events[-1].reason == "provider_http_error"


def test_timeout_maps_to_timed_out_state() -> None:
    orchestrator = RuntimeOrchestrator(SlowProvider(), timeout_seconds=0.01)

    response = asyncio.run(orchestrator.dispatch(payload()))

    assert response.accepted is False
    assert response.result_payload == {
        "error": "runtime_timeout",
        "message": "Task execution exceeded 0.01s",
        "retryable": True,
    }
    assert orchestrator.events[-1].state == ExecutionState.TIMED_OUT


def test_cancellation_records_cancelled_state() -> None:
    orchestrator = RuntimeOrchestrator(SlowProvider(), timeout_seconds=10)

    async def run_and_cancel() -> None:
        task = asyncio.create_task(orchestrator.dispatch(payload()))
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run_and_cancel())

    assert orchestrator.events[-1].state == ExecutionState.CANCELLED
