from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol

from .contracts import RuntimeAcceptedTaskPayload


@dataclass(frozen=True, slots=True)
class SandboxContext:
    sandbox_id: str
    metadata: dict[str, str]
    handle: Any | None = None


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


@dataclass(slots=True)
class E2BSandbox:
    template: str | None = None
    workdir: str = "/home/user/omniclaw"

    async def prepare(self, payload: RuntimeAcceptedTaskPayload) -> SandboxContext:
        try:
            from e2b import AsyncSandbox
        except ImportError as error:
            raise RuntimeError("e2b package is not installed") from error

        create_kwargs: dict[str, str] = {}
        if self.template:
            create_kwargs["template"] = self.template
        sandbox = await AsyncSandbox.create(**create_kwargs)
        await sandbox.commands.run(f"mkdir -p {self.workdir}")
        await sandbox.files.write(
            f"{self.workdir}/task_payload.json",
            json.dumps(
                {
                    "task_id": payload.task_id,
                    "skill_id": payload.skill_id,
                    "task_payload": payload.task_payload,
                },
                sort_keys=True,
            ),
        )
        return SandboxContext(
            sandbox_id=getattr(sandbox, "sandbox_id", None) or getattr(sandbox, "id", "e2b"),
            metadata={
                "task_id": payload.task_id,
                "boundary": "e2b",
                "workdir": self.workdir,
            },
            handle=sandbox,
        )

    async def cleanup(self, context: SandboxContext) -> None:
        if context.handle is not None:
            await context.handle.kill()
