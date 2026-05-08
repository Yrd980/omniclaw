from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, TypeAlias

JsonObject: TypeAlias = dict[str, Any]


class ContractError(ValueError):
    """Raised when a runtime payload does not match the API contract."""


@dataclass(frozen=True, slots=True)
class RuntimeCallback:
    method: Literal["POST"]
    path: str
    actor_headers: dict[str, str]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "RuntimeCallback":
        method = require_literal(value, "method", "POST")
        path = require_str(value, "path")
        actor_headers = require_str_map(value, "actor_headers")
        return cls(method=method, path=path, actor_headers=actor_headers)

    def to_dict(self) -> JsonObject:
        return {
            "method": self.method,
            "path": self.path,
            "actor_headers": dict(self.actor_headers),
        }


@dataclass(frozen=True, slots=True)
class RuntimeAcceptedTaskPayload:
    task_id: str
    parent_task_id: str | None
    hirer_agent_id: str
    worker_agent_id: str
    skill_id: str
    task_payload: JsonObject
    payment_lamports: str
    worker_payout_lamports: str
    deadline: str
    accepted_at: str | None
    callback: RuntimeCallback

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "RuntimeAcceptedTaskPayload":
        return cls(
            task_id=require_str(value, "task_id"),
            parent_task_id=require_optional_str(value, "parent_task_id"),
            hirer_agent_id=require_str(value, "hirer_agent_id"),
            worker_agent_id=require_str(value, "worker_agent_id"),
            skill_id=require_str(value, "skill_id"),
            task_payload=require_json_object(value, "task_payload"),
            payment_lamports=require_str(value, "payment_lamports"),
            worker_payout_lamports=require_str(value, "worker_payout_lamports"),
            deadline=require_str(value, "deadline"),
            accepted_at=require_optional_str(value, "accepted_at"),
            callback=RuntimeCallback.from_mapping(require_mapping(value, "callback")),
        )

    def to_dict(self) -> JsonObject:
        return {
            "task_id": self.task_id,
            "parent_task_id": self.parent_task_id,
            "hirer_agent_id": self.hirer_agent_id,
            "worker_agent_id": self.worker_agent_id,
            "skill_id": self.skill_id,
            "task_payload": dict(self.task_payload),
            "payment_lamports": self.payment_lamports,
            "worker_payout_lamports": self.worker_payout_lamports,
            "deadline": self.deadline,
            "accepted_at": self.accepted_at,
            "callback": self.callback.to_dict(),
        }


@dataclass(frozen=True, slots=True)
class RuntimeSubmitResultPayload:
    result_payload: JsonObject
    artifacts: list[Any] = field(default_factory=list)

    def to_dict(self) -> JsonObject:
        return {
            "result_payload": dict(self.result_payload),
            "artifacts": list(self.artifacts),
        }


@dataclass(frozen=True, slots=True)
class RuntimeDispatchResponse:
    accepted: bool
    result_payload: JsonObject | None = None
    artifacts: list[Any] | None = None

    def to_dict(self) -> JsonObject:
        body: JsonObject = {"accepted": self.accepted}
        if self.result_payload is not None:
            body["result_payload"] = dict(self.result_payload)
        if self.artifacts is not None:
            body["artifacts"] = list(self.artifacts)
        return body


def require_mapping(value: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    item = value.get(key)
    if not isinstance(item, Mapping):
        raise ContractError(f"{key} must be an object")
    return item


def require_json_object(value: Mapping[str, Any], key: str) -> JsonObject:
    item = value.get(key)
    if not isinstance(item, dict):
        raise ContractError(f"{key} must be a JSON object")
    return dict(item)


def require_str(value: Mapping[str, Any], key: str) -> str:
    item = value.get(key)
    if not isinstance(item, str):
        raise ContractError(f"{key} must be a string")
    return item


def require_optional_str(value: Mapping[str, Any], key: str) -> str | None:
    item = value.get(key)
    if item is None:
        return None
    if not isinstance(item, str):
        raise ContractError(f"{key} must be a string or null")
    return item


def require_literal(value: Mapping[str, Any], key: str, expected: str) -> Any:
    item = require_str(value, key)
    if item != expected:
        raise ContractError(f"{key} must be {expected}")
    return item


def require_str_map(value: Mapping[str, Any], key: str) -> dict[str, str]:
    item = value.get(key)
    if not isinstance(item, Mapping) or any(
        not isinstance(map_key, str) or not isinstance(map_value, str)
        for map_key, map_value in item.items()
    ):
        raise ContractError(f"{key} must be an object with string values")
    return dict(item)
