from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .contracts import RuntimeAcceptedTaskPayload, RuntimeDispatchResponse
from .config import RuntimeSettings, build_graph, build_provider, build_sandbox
from .orchestrator import RuntimeOrchestrator


class RuntimeService:
    def __init__(self, orchestrator: RuntimeOrchestrator) -> None:
        self.orchestrator = orchestrator

    async def dispatch_mapping(self, payload: Mapping[str, Any]) -> RuntimeDispatchResponse:
        accepted_task = RuntimeAcceptedTaskPayload.from_mapping(payload)
        return await self.orchestrator.dispatch(accepted_task)


def build_runtime_service(settings: RuntimeSettings | None = None) -> RuntimeService:
    resolved = settings or RuntimeSettings.from_env()
    provider = build_provider(resolved)
    orchestrator = RuntimeOrchestrator(
        provider=provider,
        sandbox=build_sandbox(resolved),
        graph=build_graph(resolved),
        timeout_seconds=resolved.timeout_seconds,
    )
    return RuntimeService(orchestrator)
