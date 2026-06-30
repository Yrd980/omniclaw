FROM python:3.12-slim AS base
WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

COPY src/ ./src/

EXPOSE 50051
CMD ["uv", "run", "python", "-m", "omniclaw_agent_runtime.grpc_service", "--bind", "0.0.0.0:50051"]
