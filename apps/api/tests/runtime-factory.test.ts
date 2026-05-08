import { describe, expect, test } from "bun:test";
import { GrpcRuntimeAdapter, MockRuntimeAdapter } from "../src/adapters/runtime";
import { createRuntimeAdapterFromEnv } from "../src/adapters/runtime-factory";

describe("runtime adapter factory", () => {
  test("defaults to mock runtime adapter", () => {
    expect(createRuntimeAdapterFromEnv({})).toBeInstanceOf(MockRuntimeAdapter);
  });

  test("creates grpc runtime adapter from environment", () => {
    expect(createRuntimeAdapterFromEnv({
      OMNICLAW_RUNTIME_ADAPTER: "grpc",
      OMNICLAW_RUNTIME_GRPC_TARGET: "localhost:50051",
    })).toBeInstanceOf(GrpcRuntimeAdapter);
  });

  test("rejects unsupported or incomplete runtime adapter configuration", () => {
    expect(() => createRuntimeAdapterFromEnv({ OMNICLAW_RUNTIME_ADAPTER: "grpc" })).toThrow("OMNICLAW_RUNTIME_GRPC_TARGET");
    expect(() => createRuntimeAdapterFromEnv({ OMNICLAW_RUNTIME_ADAPTER: "http" })).toThrow("unsupported runtime adapter");
  });
});
