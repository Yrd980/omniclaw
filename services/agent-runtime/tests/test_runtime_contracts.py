import pytest

from omniclaw_agent_runtime.contracts import ContractError, RuntimeAcceptedTaskPayload


def accepted_task_payload() -> dict:
    return {
        "task_id": "task-1",
        "parent_task_id": None,
        "hirer_agent_id": "hirer-1",
        "worker_agent_id": "worker-1",
        "skill_id": "skill-1",
        "task_payload": {"prompt": "Summarize this"},
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


def test_runtime_payload_matches_typescript_adapter_contract() -> None:
    payload = RuntimeAcceptedTaskPayload.from_mapping(accepted_task_payload())

    assert payload.to_dict() == accepted_task_payload()
    assert payload.callback.actor_headers == {"x-agent-id": "worker-1"}


def test_runtime_payload_rejects_non_object_task_payload() -> None:
    raw = accepted_task_payload()
    raw["task_payload"] = []

    with pytest.raises(ContractError, match="task_payload"):
        RuntimeAcceptedTaskPayload.from_mapping(raw)
