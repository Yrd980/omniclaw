from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from .providers import DeepSeekProvider, ModelProvider

ProviderName = Literal["deepseek"]


@dataclass(frozen=True, slots=True)
class RuntimeSettings:
    provider: ProviderName = "deepseek"
    timeout_seconds: float = 60.0
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com/chat/completions"

    @classmethod
    def from_env(cls) -> "RuntimeSettings":
        return cls(
            provider=parse_provider(os.getenv("OMNICLAW_RUNTIME_PROVIDER", "deepseek")),
            timeout_seconds=float(os.getenv("OMNICLAW_RUNTIME_TIMEOUT_SECONDS", "60")),
            deepseek_model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            deepseek_base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions"),
        )


def build_provider(settings: RuntimeSettings) -> ModelProvider:
    if settings.provider == "deepseek":
        return DeepSeekProvider(
            model=settings.deepseek_model,
            base_url=settings.deepseek_base_url,
        )
    raise ValueError(f"unsupported runtime provider: {settings.provider}")


def parse_provider(value: str) -> ProviderName:
    if value == "deepseek":
        return "deepseek"
    raise ValueError(f"unsupported runtime provider: {value}")
