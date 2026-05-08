from __future__ import annotations

from typing import Protocol, TypedDict

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
        return await provider.execute(payload, sandbox_metadata=sandbox_context.metadata)


class RuntimeGraphState(TypedDict):
    payload: RuntimeAcceptedTaskPayload
    provider: ModelProvider
    sandbox_context: SandboxContext
    result: ProviderResult | None


class LangGraphRuntimeGraph:
    def __init__(self) -> None:
        self._compiled = self._compile()

    async def run(
        self,
        payload: RuntimeAcceptedTaskPayload,
        provider: ModelProvider,
        sandbox_context: SandboxContext,
    ) -> ProviderResult:
        state = await self._compiled.ainvoke(
            {
                "payload": payload,
                "provider": provider,
                "sandbox_context": sandbox_context,
                "result": None,
            },
            {"configurable": {"thread_id": payload.task_id}},
        )
        result = state["result"]
        if result is None:
            raise RuntimeError("LangGraph runtime finished without a provider result")
        return result

    def _compile(self):
        try:
            from langgraph.graph import END, START, StateGraph
        except ImportError as error:
            raise RuntimeError("langgraph package is not installed") from error

        async def execute_provider(state: RuntimeGraphState) -> dict[str, ProviderResult]:
            result = await state["provider"].execute(
                state["payload"],
                sandbox_metadata=state["sandbox_context"].metadata,
            )
            return {"result": result}

        workflow = StateGraph(RuntimeGraphState)
        workflow.add_node("execute_provider", execute_provider)
        workflow.add_edge(START, "execute_provider")
        workflow.add_edge("execute_provider", END)
        return workflow.compile()
