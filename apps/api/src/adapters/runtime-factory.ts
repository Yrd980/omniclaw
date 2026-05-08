import { ApiError } from "../errors";
import { GrpcRuntimeAdapter, MockRuntimeAdapter, type RuntimeAdapter } from "./runtime";

export type RuntimeAdapterMode = "mock" | "grpc";

export type RuntimeAdapterEnv = Partial<Record<"OMNICLAW_RUNTIME_ADAPTER" | "OMNICLAW_RUNTIME_GRPC_TARGET", string>>;

export const createRuntimeAdapterFromEnv = (env: RuntimeAdapterEnv = runtimeEnvFromProcess()): RuntimeAdapter => {
  const mode = parseRuntimeAdapterMode(env.OMNICLAW_RUNTIME_ADAPTER ?? "mock");
  if (mode === "grpc") {
    const target = env.OMNICLAW_RUNTIME_GRPC_TARGET;
    if (!target) {
      throw new ApiError(500, "CONFIG_ERROR", "OMNICLAW_RUNTIME_GRPC_TARGET is required when OMNICLAW_RUNTIME_ADAPTER=grpc");
    }
    return new GrpcRuntimeAdapter(target);
  }
  return new MockRuntimeAdapter();
};

const parseRuntimeAdapterMode = (value: string): RuntimeAdapterMode => {
  if (value === "mock" || value === "grpc") {
    return value;
  }
  throw new ApiError(500, "CONFIG_ERROR", `unsupported runtime adapter: ${value}`);
};

const runtimeEnvFromProcess = (): RuntimeAdapterEnv => ({
  OMNICLAW_RUNTIME_ADAPTER: process.env.OMNICLAW_RUNTIME_ADAPTER,
  OMNICLAW_RUNTIME_GRPC_TARGET: process.env.OMNICLAW_RUNTIME_GRPC_TARGET,
});
