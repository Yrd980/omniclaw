from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .contracts import RuntimeAcceptedTaskPayload


@dataclass(frozen=True, slots=True)
class SandboxContext:
    sandbox_id: str
    metadata: dict[str, str]


class Sandbox(Protocol):
    async def prepare(self, payload: RuntimeAcceptedTaskPayload) -> SandboxContext:
        """Prepare an execution boundary for a task."""

    async def cleanup(self, context: SandboxContext) -> None:
        """Release the execution boundary."""


@dataclass(slots=True)
class NoopSandbox:
    sandbox_id: str = "local-noop"

    async def prepare(self, payload: RuntimeAcceptedTaskPayload) -> SandboxContext:
        return SandboxContext(
            sandbox_id=self.sandbox_id,
            metadata={
                "task_id": payload.task_id,
                "boundary": "noop",
            },
        )

    async def cleanup(self, context: SandboxContext) -> None:
        return None
