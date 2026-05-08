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
  escrowAccountPrefix: string;
  lockTxPrefix: string;
  payoutTxPrefix: string;
  refundTxPrefix: string;
  protocolFeeWallet: string;
  runtimeFeeWallet: string;
};

export const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
  escrowAccountPrefix: "mock_escrow",
  lockTxPrefix: "mock_lock",
  payoutTxPrefix: "mock_payout",
  refundTxPrefix: "mock_refund",
  protocolFeeWallet: "protocol_fee_wallet",
  runtimeFeeWallet: "runtime_fee_wallet",
};
