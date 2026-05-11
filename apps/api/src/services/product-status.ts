import { configuredSettlementAdapterKind } from "../adapters/settlement-factory";
import { solanaContractInfo } from "../adapters/solana-contract";

export type CapabilityStatus = "live_sdk_api" | "contract_ready" | "api_ledger" | "mocked_boundary";

export type ProductCapability = {
  id: string;
  label: string;
  status: CapabilityStatus;
  description: string;
};

export type RuntimeStatus = {
  adapter_mode: "mock" | "grpc";
  grpc_target: string | null;
  provider: string;
  sandbox: string;
  dispatch_path: "deterministic_mock" | "grpc_runtime";
  result_submission: "api_callback_contract";
};

export type ProductCapabilities = {
  capabilities: ProductCapability[];
  boundaries: {
    sdk_api: "live";
    settlement: "mock" | "anchor";
    runtime: "mock" | "grpc";
    wallet_auth: "header_actor_controls";
    token_records: "api_ledger";
    skill_credentials: "api_ledger";
  };
};

export const runtimeStatusFromEnv = (env: NodeJS.ProcessEnv = process.env): RuntimeStatus => {
  const adapterMode = env.OMNICLAW_RUNTIME_ADAPTER === "grpc" ? "grpc" : "mock";
  return {
    adapter_mode: adapterMode,
    grpc_target: adapterMode === "grpc" ? env.OMNICLAW_RUNTIME_GRPC_TARGET ?? null : null,
    provider: env.OMNICLAW_RUNTIME_PROVIDER ?? (adapterMode === "grpc" ? "deepseek" : "mock"),
    sandbox: env.OMNICLAW_RUNTIME_SANDBOX ?? "noop",
    dispatch_path: adapterMode === "grpc" ? "grpc_runtime" : "deterministic_mock",
    result_submission: "api_callback_contract",
  };
};

export const productCapabilitiesFromEnv = (env: NodeJS.ProcessEnv = process.env): ProductCapabilities => {
  const runtime = runtimeStatusFromEnv(env).adapter_mode;
  const settlement = configuredSettlementAdapterKind();
  const solana = solanaContractInfo();

  return {
    capabilities: [
      {
        id: "delegation_graph",
        label: "Delegation graph",
        status: "live_sdk_api",
        description: "Parent and child task lineage is created through SDK/API calls and rendered from task graph DTOs.",
      },
      {
        id: "marketplace_discovery",
        label: "Marketplace discovery",
        status: "live_sdk_api",
        description: "Agents are discovered by capability, reputation, latency, price, stake, and status ranking inputs.",
      },
      {
        id: "task_lifecycle",
        label: "Escrow task lifecycle",
        status: "live_sdk_api",
        description: "Task creation, escrow lock, acceptance, submission, resolution, settlement events, and reputation events are API-backed.",
      },
      {
        id: "runtime_execution",
        label: "Runtime execution",
        status: runtime === "grpc" ? "live_sdk_api" : "mocked_boundary",
        description: runtime === "grpc"
          ? "Accepted tasks dispatch to the configured gRPC runtime and submit results through the API callback contract."
          : "Accepted tasks use deterministic mock execution unless OMNICLAW_RUNTIME_ADAPTER=grpc is configured.",
      },
      {
        id: "solana_settlement",
        label: "Solana settlement",
        status: settlement === "anchor" ? "live_sdk_api" : "contract_ready",
        description: settlement === "anchor"
          ? `Settlement routes through the Anchor adapter for program ${solana.program_id}.`
          : "Anchor escrow, payout, cancel, and slash instructions are available behind the settlement adapter.",
      },
      {
        id: "ledger_records",
        label: "Ledger records",
        status: "api_ledger",
        description: "Bids, stake events, token balances, token swaps, skill credentials, and wallet profiles are API ledger records.",
      },
    ],
    boundaries: {
      sdk_api: "live",
      settlement,
      runtime,
      wallet_auth: "header_actor_controls",
      token_records: "api_ledger",
      skill_credentials: "api_ledger",
    },
  };
};
