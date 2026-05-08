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

    async def execute(self, payload: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        """Execute a task and return a provider-normalized result."""


@dataclass(slots=True)
class EchoProvider:
    name: str = "echo"

    async def execute(self, payload: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        return ProviderResult(
            result_payload={
                "provider": self.name,
                "task_id": payload.task_id,
                "echo": payload.task_payload,
                "sandbox": public_sandbox_metadata(sandbox_metadata),
            },
            artifacts=[],
        )


@dataclass(slots=True)
class DeepSeekProvider:
    api_key: str | None = None
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com/chat/completions"
    timeout_seconds: float = 30.0

    name: str = "deepseek"

    async def execute(self, payload: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        key = self.api_key or os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise ProviderExecutionError("DEEPSEEK_API_KEY is not configured", code="provider_auth")

        web_observations = await collect_web_observations(payload.task_payload)

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
                            "web_observations": web_observations,
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
            artifacts=web_observations,
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


@dataclass(slots=True)
class LangChainDeepSeekProvider:
    api_key: str | None = None
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com"
    temperature: float = 0.0

    name: str = "deepseek"

    async def execute(self, payload: RuntimeAcceptedTaskPayload, *, sandbox_metadata: dict[str, str] | None = None) -> ProviderResult:
        key = self.api_key or os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise ProviderExecutionError("DEEPSEEK_API_KEY is not configured", code="provider_auth")
        try:
            from langchain.chat_models import init_chat_model
        except ImportError as error:
            raise ProviderExecutionError("langchain is not installed", code="provider_dependency") from error

        web_observations = await collect_web_observations(payload.task_payload)
        model = init_chat_model(
            self.model,
            model_provider="openai",
            api_key=key,
            base_url=self.base_url,
            temperature=self.temperature,
        )
        messages = [
            (
                "system",
                "You execute OmniClaw marketplace tasks. Return concise JSON-compatible content without private reasoning.",
            ),
            (
                "human",
                json.dumps(
                    {
                        "task_id": payload.task_id,
                        "skill_id": payload.skill_id,
                        "task_payload": payload.task_payload,
                        "sandbox": public_sandbox_metadata(sandbox_metadata),
                        "web_observations": web_observations,
                    },
                    sort_keys=True,
                ),
            ),
        ]
        try:
            response = await model.ainvoke(messages)
        except Exception as error:
            raise ProviderExecutionError(str(error), code="provider_error", retryable=True) from error
        content = getattr(response, "content", response)
        return ProviderResult(
            result_payload={
                "provider": self.name,
                "model": self.model,
                "content": stringify_content(content),
            },
            artifacts=web_observations,
        )


def stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    return json.dumps(content, sort_keys=True)


def public_sandbox_metadata(metadata: dict[str, str] | None) -> dict[str, str]:
    if not metadata:
        return {}
    return {
        key: value
        for key, value in metadata.items()
        if key in {"boundary", "workdir"}
    }


async def collect_web_observations(task_payload: JsonObject) -> list[JsonObject]:
    requests = task_payload.get("web_requests")
    if not isinstance(requests, list):
        return []
    observations = await asyncio.gather(
        *(asyncio.to_thread(fetch_web_observation, item) for item in requests[:5]),
        return_exceptions=True,
    )
    normalized: list[JsonObject] = []
    for index, observation in enumerate(observations):
        if isinstance(observation, Exception):
            normalized.append({
                "name": f"request_{index}",
                "ok": False,
                "error": str(observation),
            })
        else:
            normalized.append(observation)
    return normalized


def fetch_web_observation(raw: Any) -> JsonObject:
    if not isinstance(raw, dict) or not isinstance(raw.get("url"), str):
        raise ProviderExecutionError("web_requests entries must include a url", code="provider_bad_request")
    url = raw["url"]
    request = urllib.request.Request(
        url,
        headers={
            "accept": "application/json,text/plain,*/*",
            "user-agent": "omniclaw-agent-runtime/0.1",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read(200_000).decode("utf-8", errors="replace")
        content_type = response.headers.get("content-type", "")
    parsed: Any
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        parsed = body[:10_000]
    return {
        "name": raw.get("name") if isinstance(raw.get("name"), str) else url,
        "url": url,
        "ok": True,
        "content_type": content_type,
        "data": parsed,
    }
