export type SolanaContractInfo = {
  settlement_mode: "mock" | "anchor";
  configured_settlement_adapter: "mock" | "anchor";
  program_id: string;
  cluster: string;
  rpc_url: string;
  contract_path: string;
  frontend_helper: string;
  explorer_base_url: string | null;
  anchor_commands: {
    build: string;
    test: string;
    typecheck: string;
  };
  pda_seeds: {
    agent: string;
    vault: string;
  };
  job_statuses: Array<{
    value: number;
    label: string;
    api_status: string;
  }>;
  instructions: string[];
};

export const DEFAULT_SOLANA_PROGRAM_ID = "292wuc4zRvyEk1of5Ek8EDMtH9oRjbU1HKaoNTRWm3fv";

export const solanaContractInfo = (): SolanaContractInfo => {
  const cluster = process.env.SOLANA_CLUSTER ?? "localnet";
  const configuredSettlementAdapter = process.env.OMNICLAW_SETTLEMENT_ADAPTER === "anchor" ? "anchor" : "mock";
  return {
    settlement_mode: configuredSettlementAdapter,
    configured_settlement_adapter: configuredSettlementAdapter,
    program_id: process.env.OMNICLAW_SOLANA_PROGRAM_ID ?? DEFAULT_SOLANA_PROGRAM_ID,
    cluster,
    rpc_url: process.env.SOLANA_RPC_URL ?? (cluster === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899"),
    contract_path: "contracts/solana",
    frontend_helper: "contracts/solana/app/omniclawClient.ts",
    explorer_base_url: explorerBaseUrl(cluster),
    anchor_commands: {
      build: "bun run chain:build",
      test: "bun run chain:test",
      typecheck: "bun run chain:typecheck",
    },
    pda_seeds: {
      agent: "[\"agent\", owner]",
      vault: "[\"vault\", job_account]",
    },
    job_statuses: [
      { value: 0, label: "open", api_status: "escrow_locked" },
      { value: 1, label: "submitted", api_status: "submitted" },
      { value: 2, label: "completed", api_status: "completed" },
      { value: 3, label: "cancelled", api_status: "cancelled" },
      { value: 4, label: "slashed", api_status: "failed" },
    ],
    instructions: ["register_agent", "create_job", "submit_work", "complete_job", "cancel_job", "slash_agent"],
  };
};

const explorerBaseUrl = (cluster: string): string | null => {
  if (cluster === "mainnet-beta") {
    return "https://explorer.solana.com";
  }
  if (cluster === "devnet" || cluster === "testnet") {
    return `https://explorer.solana.com?cluster=${cluster}`;
  }
  return null;
};
