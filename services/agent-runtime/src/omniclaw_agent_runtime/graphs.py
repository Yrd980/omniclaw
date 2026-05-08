from __future__ import annotations

from typing import Protocol

from .contracts import RuntimeAcceptedTaskPayload
from .providers import ModelProvider, ProviderResult
from .sandbox import SandboxContext


class RuntimeGraph(Protocol):
    async def run(
        self,
        payload: RuntimeAcceptedTaskPayload,
        provider: ModelProvider,
        sandbox_context: SandboxContext,
    ) -> ProviderResult:
        """Run the runtime execution graph for a task."""


class LinearRuntimeGraph:
    async def run(
        self,
        payload: RuntimeAcceptedTaskPayload,
        provider: ModelProvider,
        sandbox_context: SandboxContext,
    ) -> ProviderResult:
        return await provider.execute(payload)
