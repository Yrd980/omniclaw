from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Protocol

from .contracts import JsonObject, RuntimeAcceptedTaskPayload


@dataclass(frozen=True, slots=True)
class ProviderResult:
    result_payload: JsonObject
    artifacts: list[Any] = field(default_factory=list)


class ProviderExecutionError(RuntimeError):
    def __init__(self, message: str, *, code: str = "provider_error", retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class ModelProvider(Protocol):
    name: str

    async def execute(self, payload: RuntimeAcceptedTaskPayload) -> ProviderResult:
        """Execute a task and return a provider-normalized result."""


@dataclass(slots=True)
class DeepSeekProvider:
    api_key: str | None = None
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com/chat/completions"
    timeout_seconds: float = 30.0

    name: str = "deepseek"

    async def execute(self, payload: RuntimeAcceptedTaskPayload) -> ProviderResult:
        key = self.api_key or os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise ProviderExecutionError("DEEPSEEK_API_KEY is not configured", code="provider_auth")

        request_body = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are executing an OmniClaw marketplace task. Return concise JSON-compatible output.",
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "task_id": payload.task_id,
                            "skill_id": payload.skill_id,
                            "task_payload": payload.task_payload,
                        },
                        sort_keys=True,
                    ),
                },
            ],
        }
        response = await asyncio.to_thread(self._post_json, request_body, key)
        content = self._extract_content(response)
        return ProviderResult(
            result_payload={
                "provider": self.name,
                "model": self.model,
                "content": content,
            },
            artifacts=[],
        )

    def _post_json(self, body: JsonObject, api_key: str) -> JsonObject:
        request = urllib.request.Request(
            self.base_url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "authorization": f"Bearer {api_key}",
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                parsed = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            retryable = error.code >= 500 or error.code == 429
            raise ProviderExecutionError(
                f"DeepSeek request failed with HTTP {error.code}",
                code="provider_http_error",
                retryable=retryable,
            ) from error
        except urllib.error.URLError as error:
            raise ProviderExecutionError(
                f"DeepSeek request failed: {error.reason}",
                code="provider_network_error",
                retryable=True,
            ) from error
        except json.JSONDecodeError as error:
            raise ProviderExecutionError("DeepSeek returned invalid JSON", code="provider_bad_response") from error

        if not isinstance(parsed, dict):
            raise ProviderExecutionError("DeepSeek returned a non-object response", code="provider_bad_response")
        return parsed

    @staticmethod
    def _extract_content(response: JsonObject) -> str:
        choices = response.get("choices")
        if (
            isinstance(choices, list)
            and choices
            and isinstance(choices[0], dict)
            and isinstance(choices[0].get("message"), dict)
            and isinstance(choices[0]["message"].get("content"), str)
        ):
            return choices[0]["message"]["content"]
        raise ProviderExecutionError("DeepSeek response did not contain message content", code="provider_bad_response")
