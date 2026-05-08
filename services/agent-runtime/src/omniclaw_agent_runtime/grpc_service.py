from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

import grpc
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
from grpc import aio

from .contracts import ContractError, RuntimeDispatchResponse
from .service import RuntimeService, build_runtime_service

SERVICE_NAME = "omniclaw.runtime.v1.AgentRuntimeService"


class RuntimeGrpcSchema:
    def __init__(self) -> None:
        self.pool = descriptor_pool.DescriptorPool()
        self.pool.AddSerializedFile(build_descriptor().SerializeToString())
        self.dispatch_request = message_factory.GetMessageClass(self.pool.FindMessageTypeByName("omniclaw.runtime.v1.DispatchTaskRequest"))
        self.dispatch_response = message_factory.GetMessageClass(self.pool.FindMessageTypeByName("omniclaw.runtime.v1.DispatchTaskResponse"))
        self.progress_request = message_factory.GetMessageClass(self.pool.FindMessageTypeByName("omniclaw.runtime.v1.GetTaskProgressRequest"))
        self.progress_response = message_factory.GetMessageClass(self.pool.FindMessageTypeByName("omniclaw.runtime.v1.GetTaskProgressResponse"))
        self.cancel_request = message_factory.GetMessageClass(self.pool.FindMessageTypeByName("omniclaw.runtime.v1.CancelTaskRequest"))
        self.cancel_response = message_factory.GetMessageClass(self.pool.FindMessageTypeByName("omniclaw.runtime.v1.CancelTaskResponse"))


class AgentRuntimeGrpcService:
    def __init__(self, runtime: RuntimeService, schema: RuntimeGrpcSchema | None = None) -> None:
        self.runtime = runtime
        self.schema = schema or RuntimeGrpcSchema()

    async def dispatch_task(self, request: Any, context: aio.ServicerContext) -> Any:
        try:
            response = await self.runtime.dispatch_mapping(dispatch_request_to_mapping(request))
        except ContractError as error:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(error))
        except Exception as error:
            await context.abort(grpc.StatusCode.INTERNAL, str(error))
        return dispatch_response_to_proto(self.schema, response)

    async def get_task_progress(self, request: Any, context: aio.ServicerContext) -> Any:
        events = [
            {
                "state": event.state.value,
                "task_id": event.task_id,
                "timestamp": event.timestamp,
                "reason": event.reason,
                "detail": event.detail,
            }
            for event in self.runtime.orchestrator.events
            if event.task_id == request.task_id
        ]
        response = self.schema.progress_response()
        for event in events:
            item = response.events.add()
            item.state = event["state"]
            item.task_id = event["task_id"]
            item.timestamp = event["timestamp"]
            if event["reason"] is not None:
                item.reason = event["reason"]
            item.detail.json = json.dumps(event["detail"], sort_keys=True)
        return response

    async def cancel_task(self, request: Any, context: aio.ServicerContext) -> Any:
        response = self.schema.cancel_response()
        response.cancelled = False
        return response


async def serve(bind: str = "[::]:50051", runtime: RuntimeService | None = None) -> None:
    schema = RuntimeGrpcSchema()
    service = AgentRuntimeGrpcService(runtime or build_runtime_service(), schema)
    server = aio.server()
    dispatch_handler = grpc.unary_unary_rpc_method_handler(
        service.dispatch_task,
        request_deserializer=schema.dispatch_request.FromString,
        response_serializer=lambda message: message.SerializeToString(),
    )
    progress_handler = grpc.unary_unary_rpc_method_handler(
        service.get_task_progress,
        request_deserializer=schema.progress_request.FromString,
        response_serializer=lambda message: message.SerializeToString(),
    )
    cancel_handler = grpc.unary_unary_rpc_method_handler(
        service.cancel_task,
        request_deserializer=schema.cancel_request.FromString,
        response_serializer=lambda message: message.SerializeToString(),
    )
    generic = grpc.method_handlers_generic_handler(
        SERVICE_NAME,
        {
            "DispatchTask": dispatch_handler,
            "GetTaskProgress": progress_handler,
            "CancelTask": cancel_handler,
        },
    )
    server.add_generic_rpc_handlers((generic,))
    server.add_insecure_port(bind)
    await server.start()
    try:
        await server.wait_for_termination()
    except asyncio.CancelledError:
        await asyncio.shield(server.stop(grace=1))
        raise


def dispatch_request_to_mapping(request: Any) -> dict[str, Any]:
    return {
        "task_id": request.task_id,
        "parent_task_id": optional_string(request, "parent_task_id"),
        "hirer_agent_id": request.hirer_agent_id,
        "worker_agent_id": request.worker_agent_id,
        "skill_id": request.skill_id,
        "task_payload": json.loads(request.task_payload.json or "{}"),
        "payment_lamports": request.payment_lamports,
        "worker_payout_lamports": request.worker_payout_lamports,
        "deadline": request.deadline,
        "accepted_at": optional_string(request, "accepted_at"),
        "callback": {
            "method": request.callback.method,
            "path": request.callback.path,
            "actor_headers": dict(request.callback.actor_headers),
        },
    }


def dispatch_response_to_proto(schema: RuntimeGrpcSchema, response: RuntimeDispatchResponse) -> Any:
    message = schema.dispatch_response()
    message.accepted = response.accepted
    message.result_payload.json = json.dumps(response.result_payload or {}, sort_keys=True)
    for artifact in response.artifacts or []:
        message.artifacts.add().json = json.dumps(artifact, sort_keys=True)
    return message


def optional_string(message: Any, field: str) -> str | None:
    try:
        return getattr(message, field) if message.HasField(field) else None
    except ValueError:
        value = getattr(message, field)
        return value or None


def build_descriptor() -> descriptor_pb2.FileDescriptorProto:
    file_descriptor = descriptor_pb2.FileDescriptorProto()
    file_descriptor.name = "agent_runtime.proto"
    file_descriptor.package = "omniclaw.runtime.v1"
    file_descriptor.syntax = "proto3"

    file_descriptor.message_type.add(name="StructJson").field.add(
        name="json",
        number=1,
        label=descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL,
        type=descriptor_pb2.FieldDescriptorProto.TYPE_STRING,
    )
    callback = file_descriptor.message_type.add(name="RuntimeCallback")
    add_field(callback, "method", 1, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(callback, "path", 2, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    headers = callback.nested_type.add(name="ActorHeadersEntry")
    headers.options.map_entry = True
    add_field(headers, "key", 1, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(headers, "value", 2, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(callback, "actor_headers", 3, descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE, ".omniclaw.runtime.v1.RuntimeCallback.ActorHeadersEntry", repeated=True)

    request = file_descriptor.message_type.add(name="DispatchTaskRequest")
    for name, number in [
        ("task_id", 1),
        ("parent_task_id", 2),
        ("hirer_agent_id", 3),
        ("worker_agent_id", 4),
        ("skill_id", 5),
    ]:
        add_field(request, name, number, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(request, "task_payload", 6, descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE, ".omniclaw.runtime.v1.StructJson")
    for name, number in [
        ("payment_lamports", 7),
        ("worker_payout_lamports", 8),
        ("deadline", 9),
        ("accepted_at", 10),
    ]:
        add_field(request, name, number, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(request, "callback", 11, descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE, ".omniclaw.runtime.v1.RuntimeCallback")

    response = file_descriptor.message_type.add(name="DispatchTaskResponse")
    add_field(response, "accepted", 1, descriptor_pb2.FieldDescriptorProto.TYPE_BOOL)
    add_field(response, "result_payload", 2, descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE, ".omniclaw.runtime.v1.StructJson")
    add_field(response, "artifacts", 3, descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE, ".omniclaw.runtime.v1.StructJson", repeated=True)

    progress_request = file_descriptor.message_type.add(name="GetTaskProgressRequest")
    add_field(progress_request, "task_id", 1, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    event = file_descriptor.message_type.add(name="ExecutionEvent")
    add_field(event, "state", 1, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(event, "task_id", 2, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(event, "timestamp", 3, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(event, "reason", 4, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    add_field(event, "detail", 5, descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE, ".omniclaw.runtime.v1.StructJson")
    progress_response = file_descriptor.message_type.add(name="GetTaskProgressResponse")
    add_field(progress_response, "events", 1, descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE, ".omniclaw.runtime.v1.ExecutionEvent", repeated=True)
    cancel_request = file_descriptor.message_type.add(name="CancelTaskRequest")
    add_field(cancel_request, "task_id", 1, descriptor_pb2.FieldDescriptorProto.TYPE_STRING)
    cancel_response = file_descriptor.message_type.add(name="CancelTaskResponse")
    add_field(cancel_response, "cancelled", 1, descriptor_pb2.FieldDescriptorProto.TYPE_BOOL)

    service = file_descriptor.service.add(name="AgentRuntimeService")
    add_method(service, "DispatchTask", ".omniclaw.runtime.v1.DispatchTaskRequest", ".omniclaw.runtime.v1.DispatchTaskResponse")
    add_method(service, "GetTaskProgress", ".omniclaw.runtime.v1.GetTaskProgressRequest", ".omniclaw.runtime.v1.GetTaskProgressResponse")
    add_method(service, "CancelTask", ".omniclaw.runtime.v1.CancelTaskRequest", ".omniclaw.runtime.v1.CancelTaskResponse")
    return file_descriptor


def add_field(message: Any, name: str, number: int, field_type: int, type_name: str = "", repeated: bool = False) -> None:
    field = message.field.add(name=name, number=number, type=field_type)
    field.label = descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED if repeated else descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
    if type_name:
        field.type_name = type_name


def add_method(service: Any, name: str, input_type: str, output_type: str) -> None:
    method = service.method.add(name=name)
    method.input_type = input_type
    method.output_type = output_type


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="[::]:50051")
    args = parser.parse_args()
    try:
        asyncio.run(serve(args.bind))
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
