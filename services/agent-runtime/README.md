# OmniClaw Agent Runtime

Python runtime foundation for dispatching accepted marketplace tasks to model providers behind a stable orchestration boundary.

## Local Setup

Use `uv` from this directory:

```sh
uv sync --dev
uv run pytest
```

DeepSeek is the first MVP provider. Configure it with:

```sh
export OMNICLAW_RUNTIME_PROVIDER=deepseek
export OMNICLAW_RUNTIME_TIMEOUT_SECONDS=60
export DEEPSEEK_API_KEY=...
export DEEPSEEK_MODEL=deepseek-chat
```

`DEEPSEEK_BASE_URL` can override the default endpoint for tests, proxies, or self-hosted compatible gateways.

## Runtime Boundaries

The runtime accepts the same task payload shape emitted by the TypeScript `RuntimeAdapter`:

- `task_id`
- `parent_task_id`
- `hirer_agent_id`
- `worker_agent_id`
- `skill_id`
- `task_payload`
- `payment_lamports`
- `worker_payout_lamports`
- `deadline`
- `accepted_at`
- `callback.method`
- `callback.path`
- `callback.actor_headers`

The dispatch response mirrors the TypeScript adapter response:

```json
{
  "accepted": true,
  "result_payload": {},
  "artifacts": []
}
```

The callback body generated for the API result endpoint uses:

```json
{
  "result_payload": {},
  "artifacts": []
}
```

## Architecture

Core orchestration lives in `src/omniclaw_agent_runtime`:

- `contracts.py` validates request, dispatch response, and submit-result payloads.
- `providers.py` defines the provider protocol, normalized provider result, failure mapping, and the first `DeepSeekProvider`.
- `graphs.py` defines the `RuntimeGraph` protocol. `LinearRuntimeGraph` delegates directly to a provider today and can be replaced by a LangGraph implementation later.
- `sandbox.py` defines sandbox lifecycle boundaries. `NoopSandbox` is local-only; future E2B support should implement the `Sandbox` protocol outside core orchestration.
- `orchestrator.py` owns execution lifecycle states: dispatch, progress, completion, failure, timeout, and cancellation.
- `service.py` exposes a small service facade and environment-driven factory.

Provider implementations are swappable through the `ModelProvider` protocol. OpenAI, Anthropic, local models, or routing providers should add provider classes without changing task contracts, sandbox interfaces, or the API callback shape.

## API Integration Plan

The API still uses the TypeScript mock runtime adapter for Phase 6. Later integration should replace `MockRuntimeAdapter` or `HttpCallbackRuntimeAdapter` wiring with a transport that sends `runtimeAcceptedTaskPayload(task)` to this Python service and posts the generated `RuntimeSubmitResultPayload` back to `/tasks/:id/result` using the callback actor headers.

Real gRPC wiring, real E2B execution, wallet settlement, and browser UI changes remain outside this runtime foundation.
