import { parseRuntimeAdapterMode, type RuntimeAdapterMode } from "./adapters/runtime-factory";
import { ApiError } from "./errors";

export type OmniClawEnvironment = "local" | "demo" | "testnet" | "production";
export type StoreMode = "memory" | "postgres";
export type SettlementAdapterMode = "mock" | "solana_testnet";
export type AuthMode = "headers" | "signed";

export type RuntimeConfig = {
  environment: OmniClawEnvironment;
  storeMode: StoreMode;
  runtimeAdapterMode: RuntimeAdapterMode;
  settlementAdapterMode: SettlementAdapterMode;
  authMode: AuthMode;
  productionReady: boolean;
  warnings: string[];
};

export type FeeConfig = {
  platformFeeBps: bigint;
  runtimeFeeBps: bigint;
};

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  platformFeeBps: 200n,
  runtimeFeeBps: 100n,
};

export type DiscoveryRankingConfig = {
  exactSkillMatchScore: number;
  descriptionSkillMatchScore: number;
  maxComponentScore: number;
  lamportsPerPricePoint: bigint;
  lamportsPerStakePoint: bigint;
  weights: {
    skillMatch: number;
    reputation: number;
    successRate: number;
    quality: number;
    latency: number;
    price: number;
    stake: number;
  };
};

export const DEFAULT_DISCOVERY_RANKING_CONFIG: DiscoveryRankingConfig = {
  exactSkillMatchScore: 100,
  descriptionSkillMatchScore: 65,
  maxComponentScore: 100,
  lamportsPerPricePoint: 1_000_000n,
  lamportsPerStakePoint: 1_000_000n,
  weights: {
    skillMatch: 0.28,
    reputation: 0.22,
    successRate: 0.16,
    quality: 0.16,
    latency: 0.08,
    price: 0.06,
    stake: 0.04,
  },
};

export type SettlementConfig = {
  adapterMode: SettlementAdapterMode;
  escrowAccountPrefix: string;
  lockTxPrefix: string;
  payoutTxPrefix: string;
  refundTxPrefix: string;
  protocolFeeWallet: string;
  runtimeFeeWallet: string;
  solanaRpcUrl: string | null;
  solanaProgramId: string | null;
  solanaCommitment: "processed" | "confirmed" | "finalized";
  solanaMint: string | null;
};

export const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
  adapterMode: (process.env.OMNICLAW_SETTLEMENT_ADAPTER === "solana_testnet" ? "solana_testnet" : "mock"),
  escrowAccountPrefix: process.env.SETTLEMENT_ESCROW_ACCOUNT_PREFIX ?? "mock_escrow",
  lockTxPrefix: process.env.SETTLEMENT_LOCK_TX_PREFIX ?? "mock_lock",
  payoutTxPrefix: process.env.SETTLEMENT_PAYOUT_TX_PREFIX ?? "mock_payout",
  refundTxPrefix: process.env.SETTLEMENT_REFUND_TX_PREFIX ?? "mock_refund",
  protocolFeeWallet: process.env.SETTLEMENT_PROTOCOL_FEE_WALLET ?? "protocol_fee_wallet",
  runtimeFeeWallet: process.env.SETTLEMENT_RUNTIME_FEE_WALLET ?? "runtime_fee_wallet",
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? null,
  solanaProgramId: process.env.OMNICLAW_SOLANA_PROGRAM_ID ?? null,
  solanaCommitment: parseSolanaCommitment(process.env.OMNICLAW_SOLANA_COMMITMENT ?? "confirmed"),
  solanaMint: process.env.OMNICLAW_SOLANA_MINT ?? null,
};

export const runtimeConfigFromEnv = (env: Partial<Record<RuntimeConfigEnvKey, string>> = processEnv()): RuntimeConfig => {
  const config = {
    environment: parseEnvironment(env.OMNICLAW_ENV ?? "local"),
    storeMode: parseStoreMode(env.OMNICLAW_STORE ?? "memory"),
    runtimeAdapterMode: parseRuntimeAdapterMode(env.OMNICLAW_RUNTIME_ADAPTER ?? "mock"),
    settlementAdapterMode: parseSettlementAdapterMode(env.OMNICLAW_SETTLEMENT_ADAPTER ?? "mock"),
    authMode: parseAuthMode(env.OMNICLAW_AUTH_MODE ?? "headers"),
  };
  const warnings = productionWarnings(config);
  return {
    ...config,
    productionReady: warnings.length === 0,
    warnings,
  };
};

export const assertProductionReadyConfig = (config: RuntimeConfig) => {
  if (config.environment === "production" && config.warnings.length > 0) {
    throw new ApiError(500, "CONFIG_ERROR", `production configuration is not allowed: ${config.warnings.join("; ")}`);
  }
};

type RuntimeConfigEnvKey =
  | "OMNICLAW_ENV"
  | "OMNICLAW_STORE"
  | "OMNICLAW_RUNTIME_ADAPTER"
  | "OMNICLAW_SETTLEMENT_ADAPTER"
  | "OMNICLAW_AUTH_MODE";

const parseEnvironment = (value: string): OmniClawEnvironment => {
  if (value === "local" || value === "demo" || value === "testnet" || value === "production") {
    return value;
  }
  throw new ApiError(500, "CONFIG_ERROR", `unsupported OMNICLAW_ENV: ${value}`);
};

const parseStoreMode = (value: string): StoreMode => {
  if (value === "memory" || value === "postgres") {
    return value;
  }
  throw new ApiError(500, "CONFIG_ERROR", `unsupported OMNICLAW_STORE: ${value}`);
};

const parseSettlementAdapterMode = (value: string): SettlementAdapterMode => {
  if (value === "mock" || value === "solana_testnet") {
    return value;
  }
  throw new ApiError(500, "CONFIG_ERROR", `unsupported OMNICLAW_SETTLEMENT_ADAPTER: ${value}`);
};

const parseAuthMode = (value: string): AuthMode => {
  if (value === "headers" || value === "signed") {
    return value;
  }
  throw new ApiError(500, "CONFIG_ERROR", `unsupported OMNICLAW_AUTH_MODE: ${value}`);
};

const productionWarnings = (config: Omit<RuntimeConfig, "productionReady" | "warnings">): string[] => [
  config.storeMode === "memory" ? "memory store is local/demo only" : null,
  config.runtimeAdapterMode === "mock" ? "mock runtime is local/demo only" : null,
  config.settlementAdapterMode === "mock" ? "mock settlement is local/demo only" : null,
  config.environment === "production" && config.settlementAdapterMode === "solana_testnet" ? "solana_testnet settlement is testnet only" : null,
  config.authMode === "headers" ? "header actor identity is local/demo only" : null,
].filter((warning): warning is string => Boolean(warning));

function parseSolanaCommitment(value: string): SettlementConfig["solanaCommitment"] {
  if (value === "processed" || value === "confirmed" || value === "finalized") {
    return value;
  }
  return "confirmed";
}

const processEnv = (): Partial<Record<RuntimeConfigEnvKey, string>> => ({
  OMNICLAW_ENV: process.env.OMNICLAW_ENV,
  OMNICLAW_STORE: process.env.OMNICLAW_STORE,
  OMNICLAW_RUNTIME_ADAPTER: process.env.OMNICLAW_RUNTIME_ADAPTER,
  OMNICLAW_SETTLEMENT_ADAPTER: process.env.OMNICLAW_SETTLEMENT_ADAPTER,
  OMNICLAW_AUTH_MODE: process.env.OMNICLAW_AUTH_MODE,
});
