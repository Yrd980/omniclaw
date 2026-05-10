import { AnchorSettlementAdapter, parseSignerKeypairs } from "./anchor-settlement";
import { MockSettlementAdapter, type SettlementAdapter } from "./settlement";
import { DEFAULT_SOLANA_PROGRAM_ID } from "./solana-contract";

export type SettlementAdapterKind = "mock" | "anchor";

export const configuredSettlementAdapterKind = (): SettlementAdapterKind =>
  process.env.OMNICLAW_SETTLEMENT_ADAPTER === "anchor" ? "anchor" : "mock";

export const createSettlementAdapterFromEnv = (now?: () => string): SettlementAdapter => {
  if (configuredSettlementAdapterKind() !== "anchor") {
    return new MockSettlementAdapter(undefined, now);
  }

  const cluster = process.env.SOLANA_CLUSTER ?? "localnet";
  return new AnchorSettlementAdapter({
    rpcUrl: process.env.SOLANA_RPC_URL ?? (cluster === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899"),
    programId: process.env.OMNICLAW_SOLANA_PROGRAM_ID ?? DEFAULT_SOLANA_PROGRAM_ID,
    signerKeypairs: parseSignerKeypairs(process.env.OMNICLAW_ANCHOR_SIGNER_KEYPAIRS),
    idlPath: process.env.OMNICLAW_ANCHOR_IDL_PATH,
    now,
  });
};
