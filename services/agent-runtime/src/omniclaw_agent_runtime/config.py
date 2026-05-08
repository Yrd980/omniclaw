from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from .graphs import LangGraphRuntimeGraph, LinearRuntimeGraph, RuntimeGraph
from .providers import DeepSeekProvider, EchoProvider, LangChainDeepSeekProvider, ModelProvider
from .sandbox import E2BSandbox, NoopSandbox, Sandbox

ProviderName = Literal["deepseek", "echo"]
GraphName = Literal["linear", "langgraph"]
SandboxName = Literal["noop", "e2b"]


@dataclass(frozen=True, slots=True)
class RuntimeSettings:
    provider: ProviderName = "deepseek"
    graph: GraphName = "langgraph"
    sandbox: SandboxName = "noop"
    timeout_seconds: float = 60.0
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"
    use_langchain: bool = True
    e2b_template: str | None = None

    @classmethod
    def from_env(cls) -> "RuntimeSettings":
        return cls(
            provider=parse_provider(os.getenv("OMNICLAW_RUNTIME_PROVIDER", "deepseek")),
            graph=parse_graph(os.getenv("OMNICLAW_RUNTIME_GRAPH", "langgraph")),
            sandbox=parse_sandbox(os.getenv("OMNICLAW_RUNTIME_SANDBOX", "noop")),
            timeout_seconds=float(os.getenv("OMNICLAW_RUNTIME_TIMEOUT_SECONDS", "60")),
            deepseek_model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            deepseek_base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            use_langchain=os.getenv("OMNICLAW_RUNTIME_LANGCHAIN", "1") != "0",
            e2b_template=os.getenv("E2B_TEMPLATE"),
        )


def build_provider(settings: RuntimeSettings) -> ModelProvider:
    if settings.provider == "deepseek":
        if settings.use_langchain:
            return LangChainDeepSeekProvider(
                model=settings.deepseek_model,
                base_url=settings.deepseek_base_url,
            )
        return DeepSeekProvider(
            model=settings.deepseek_model,
            base_url=f"{settings.deepseek_base_url.rstrip('/')}/chat/completions",
        )
    if settings.provider == "echo":
        return EchoProvider()
    raise ValueError(f"unsupported runtime provider: {settings.provider}")


def build_graph(settings: RuntimeSettings) -> RuntimeGraph:
    if settings.graph == "langgraph":
        return LangGraphRuntimeGraph()
    if settings.graph == "linear":
        return LinearRuntimeGraph()
    raise ValueError(f"unsupported runtime graph: {settings.graph}")


def build_sandbox(settings: RuntimeSettings) -> Sandbox:
    if settings.sandbox == "e2b":
        return E2BSandbox(template=settings.e2b_template)
    if settings.sandbox == "noop":
        return NoopSandbox()
    raise ValueError(f"unsupported runtime sandbox: {settings.sandbox}")


def parse_provider(value: str) -> ProviderName:
    if value in {"deepseek", "echo"}:
        return value
    raise ValueError(f"unsupported runtime provider: {value}")


def parse_graph(value: str) -> GraphName:
    if value in {"linear", "langgraph"}:
        return value
    raise ValueError(f"unsupported runtime graph: {value}")


def parse_sandbox(value: str) -> SandboxName:
    if value in {"noop", "e2b"}:
        return value
    raise ValueError(f"unsupported runtime sandbox: {value}")
