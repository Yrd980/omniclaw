from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .contracts import RuntimeAcceptedTaskPayload, RuntimeDispatchResponse, RuntimeSubmitResultPayload
from .graphs import LinearRuntimeGraph, RuntimeGraph
from .providers import ModelProvider, ProviderExecutionError
from .sandbox import NoopSandbox, Sandbox
from .states import ExecutionState


@dataclass(frozen=True, slots=True)
class ExecutionEvent:
    state: ExecutionState
    task_id: str
    timestamp: str
    reason: str | None = None
    detail: dict[str, Any] = field(default_factory=dict)


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class RuntimeOrchestrator:
    def __init__(
        self,
        provider: ModelProvider,
        sandbox: Sandbox | None = None,
        graph: RuntimeGraph | None = None,
        timeout_seconds: float = 60.0,
        clock: Callable[[], str] = utc_now_iso,
    ) -> None:
        self.provider = provider
        self.sandbox = sandbox or NoopSandbox()
        self.graph = graph or LinearRuntimeGraph()
        self.timeout_seconds = timeout_seconds
        self.clock = clock
        self.events: list[ExecutionEvent] = []

    async def dispatch(self, payload: RuntimeAcceptedTaskPayload) -> RuntimeDispatchResponse:
        self._record(ExecutionState.DISPATCHED, payload.task_id)
        try:
            sandbox_context = await self.sandbox.prepare(payload)
        except Exception as error:
            self._record(ExecutionState.FAILED, payload.task_id, reason="sandbox_prepare_error")
            return RuntimeDispatchResponse(
                accepted=False,
                result_payload={
                    "error": "runtime_sandbox_prepare_failed",
                    "message": str(error),
                    "retryable": True,
                },
                artifacts=[],
            )

        self._record(
            ExecutionState.IN_PROGRESS,
            payload.task_id,
            detail={"provider": self.provider.name, "sandbox_id": sandbox_context.sandbox_id},
        )
        try:
            provider_result = await asyncio.wait_for(
                self.graph.run(payload, self.provider, sandbox_context),
                timeout=self.timeout_seconds,
            )
            submit_payload = RuntimeSubmitResultPayload(
                result_payload=provider_result.result_payload,
                artifacts=provider_result.artifacts,
            )
            self._record(ExecutionState.COMPLETED, payload.task_id)
            return RuntimeDispatchResponse(
                accepted=True,
                result_payload=submit_payload.result_payload,
                artifacts=submit_payload.artifacts,
            )
        except asyncio.CancelledError:
            self._record(ExecutionState.CANCELLED, payload.task_id, reason="cancelled")
            raise
        except TimeoutError:
            self._record(ExecutionState.TIMED_OUT, payload.task_id, reason="timeout")
            return RuntimeDispatchResponse(
                accepted=False,
                result_payload={
                    "error": "runtime_timeout",
                    "message": f"Task execution exceeded {self.timeout_seconds:g}s",
                    "retryable": True,
                },
                artifacts=[],
            )
        except ProviderExecutionError as error:
            self._record(ExecutionState.FAILED, payload.task_id, reason=error.code)
            return RuntimeDispatchResponse(
                accepted=False,
                result_payload={
                    "error": error.code,
                    "message": str(error),
                    "retryable": error.retryable,
                },
                artifacts=[],
            )
        except Exception as error:
            self._record(ExecutionState.FAILED, payload.task_id, reason="runtime_error")
            return RuntimeDispatchResponse(
                accepted=False,
                result_payload={
                    "error": "runtime_error",
                    "message": str(error),
                    "retryable": False,
                },
                artifacts=[],
            )
        finally:
            await self._cleanup(payload.task_id, sandbox_context.sandbox_id, sandbox_context)

    def callback_payload(self, response: RuntimeDispatchResponse) -> RuntimeSubmitResultPayload:
        return RuntimeSubmitResultPayload(
            result_payload=response.result_payload or {},
            artifacts=response.artifacts or [],
        )

    def _record(
        self,
        state: ExecutionState,
        task_id: str,
        reason: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        self.events.append(
            ExecutionEvent(
                state=state,
                task_id=task_id,
                timestamp=self.clock(),
                reason=reason,
                detail=detail or {},
            )
        )

    async def _cleanup(self, task_id: str, sandbox_id: str, sandbox_context: Any) -> None:
        try:
            await self.sandbox.cleanup(sandbox_context)
        except Exception as error:
            self._record(
                ExecutionState.FAILED,
                task_id,
                reason="sandbox_cleanup_error",
                detail={
                    "sandbox_id": sandbox_id,
                    "message": str(error),
                },
            )
