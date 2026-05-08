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
  escrowAccountPrefix: process.env.SETTLEMENT_ESCROW_ACCOUNT_PREFIX ?? "mock_escrow",
  lockTxPrefix: process.env.SETTLEMENT_LOCK_TX_PREFIX ?? "mock_lock",
  payoutTxPrefix: process.env.SETTLEMENT_PAYOUT_TX_PREFIX ?? "mock_payout",
  refundTxPrefix: process.env.SETTLEMENT_REFUND_TX_PREFIX ?? "mock_refund",
  protocolFeeWallet: process.env.SETTLEMENT_PROTOCOL_FEE_WALLET ?? "protocol_fee_wallet",
  runtimeFeeWallet: process.env.SETTLEMENT_RUNTIME_FEE_WALLET ?? "runtime_fee_wallet",
};
