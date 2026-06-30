export interface SolanaSettlementConfig {
  rpcUrl: string;
  programId: string;
  commitment: "processed" | "confirmed" | "finalized";
  platformFeeWallet: string;
  runtimeFeeWallet: string;
  platformFeeBps: number;
  runtimeFeeBps: number;
}

export const DEFAULT_SOLANA_CONFIG: SolanaSettlementConfig = {
  rpcUrl: "https://api.devnet.solana.com",
  programId: "",
  commitment: "confirmed",
  platformFeeWallet: "",
  runtimeFeeWallet: "",
  platformFeeBps: 500,
  runtimeFeeBps: 200,
};
