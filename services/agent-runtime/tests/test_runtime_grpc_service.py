import asyncio
import json
from pathlib import Path

from omniclaw_agent_runtime.grpc_service import RuntimeGrpcSchema, dispatch_request_to_mapping, dispatch_response_to_proto
from omniclaw_agent_runtime.contracts import RuntimeDispatchResponse


def test_grpc_dispatch_mapping_matches_runtime_contract() -> None:
    schema = RuntimeGrpcSchema()
    request = schema.dispatch_request()
    request.task_id = "task-1"
    request.hirer_agent_id = "hirer-1"
    request.worker_agent_id = "worker-1"
    request.skill_id = "skill-1"
    request.task_payload.json = json.dumps({"topic": "SOL"})
    request.payment_lamports = "1000"
    request.worker_payout_lamports = "900"
    request.deadline = "2026-05-08T12:00:00.000Z"
    request.callback.method = "POST"
    request.callback.path = "/tasks/task-1/result"
    request.callback.actor_headers["x-agent-id"] = "worker-1"

    assert dispatch_request_to_mapping(request) == {
        "task_id": "task-1",
        "parent_task_id": None,
        "hirer_agent_id": "hirer-1",
        "worker_agent_id": "worker-1",
        "skill_id": "skill-1",
        "task_payload": {"topic": "SOL"},
        "payment_lamports": "1000",
        "worker_payout_lamports": "900",
        "deadline": "2026-05-08T12:00:00.000Z",
        "accepted_at": None,
        "callback": {
            "method": "POST",
            "path": "/tasks/task-1/result",
            "actor_headers": {"x-agent-id": "worker-1"},
        },
    }


def test_grpc_dispatch_response_encodes_json_payloads() -> None:
    schema = RuntimeGrpcSchema()
    response = dispatch_response_to_proto(
        schema,
        RuntimeDispatchResponse(
            accepted=True,
            result_payload={"ok": True},
            artifacts=[{"kind": "text", "value": "done"}],
        ),
    )

    assert response.accepted is True
    assert json.loads(response.result_payload.json) == {"ok": True}
    assert [json.loads(artifact.json) for artifact in response.artifacts] == [{"kind": "text", "value": "done"}]


def test_grpc_schema_stays_aligned_with_proto_contract() -> None:
    schema = RuntimeGrpcSchema()
    proto = Path(__file__).resolve().parents[3] / "packages" / "proto" / "agent_runtime.proto"
    if not proto.exists():
        proto = Path(__file__).resolve().parents[5] / "packages" / "proto" / "agent_runtime.proto"
    text = proto.read_text()

    assert "service AgentRuntimeService" in text
    for method in ["DispatchTask", "GetTaskProgress", "CancelTask"]:
        assert method in text
    assert schema.dispatch_request.DESCRIPTOR.full_name == "omniclaw.runtime.v1.DispatchTaskRequest"
    assert schema.dispatch_response.DESCRIPTOR.full_name == "omniclaw.runtime.v1.DispatchTaskResponse"
