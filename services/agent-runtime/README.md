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
- `providers.py` defines the provider protocol, normalized provider result, failure mapping, and DeepSeek providers. `LangChainDeepSeekProvider` is the default production path.
- `graphs.py` defines the `RuntimeGraph` protocol. `LangGraphRuntimeGraph` is the default execution graph; `LinearRuntimeGraph` remains available for focused tests.
- `sandbox.py` defines sandbox lifecycle boundaries. `NoopSandbox` is local-only and `E2BSandbox` is enabled with `OMNICLAW_RUNTIME_SANDBOX=e2b`.
- `orchestrator.py` owns execution lifecycle states: dispatch, progress, completion, failure, timeout, and cancellation.
- `service.py` exposes a small service facade and environment-driven factory.
- `grpc_service.py` exposes `AgentRuntimeService` over gRPC using `packages/proto/agent_runtime.proto`.

Provider implementations are swappable through the `ModelProvider` protocol. OpenAI, Anthropic, local models, or routing providers should add provider classes without changing task contracts, sandbox interfaces, or the API callback shape.

## Live Web Observations

Model-backed tasks may include `task_payload.web_requests` to request bounded HTTP GET observations before model execution:

```json
{
  "task_payload": {
    "web_requests": [
      {
        "name": "binance_24hr",
        "url": "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"
      }
    ]
  }
}
```

The provider fetches up to five URLs, injects successful observations into the model prompt, and returns the observations as artifacts. The runtime does not expose private prompts, environment variables, or hidden reasoning.

For coordinator-style parent tasks that need child results before final submission, set `task_payload.runtime_submit_result=false`. The API will keep the parent task `in_progress` after runtime dispatch so the coordinator can discover workers, hire child agents, collect child task details, and submit the final aggregate result.

## API Integration

Start the gRPC runtime:

```sh
uv run python -m omniclaw_agent_runtime.grpc_service --bind 0.0.0.0:50051
```

Then run the API with:

```sh
OMNICLAW_RUNTIME_ADAPTER=grpc OMNICLAW_RUNTIME_GRPC_TARGET=localhost:50051 bun run api:dev
```

Wallet settlement and browser UI changes remain outside this runtime foundation.
