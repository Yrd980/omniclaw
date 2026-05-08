import { DEFAULT_FEE_CONFIG, type FeeConfig } from "../config";

export type FeeBreakdown = {
  paymentLamports: string;
  platformFeeLamports: string;
  runtimeFeeLamports: string;
  workerPayoutLamports: string;
};

const BASIS_POINTS = 10_000n;

export const calculateFees = (paymentLamports: string, config: FeeConfig = DEFAULT_FEE_CONFIG): FeeBreakdown => {
  const payment = BigInt(paymentLamports);
  if (payment <= 0n) {
    throw new Error("payment_lamports must be positive");
  }
  const platformFee = (payment * config.platformFeeBps) / BASIS_POINTS;
  const runtimeFee = (payment * config.runtimeFeeBps) / BASIS_POINTS;
  const workerPayout = payment - platformFee - runtimeFee;
  if (workerPayout < 0n) {
    throw new Error("fee calculation produced negative worker payout");
  }
  return {
    paymentLamports: payment.toString(),
    platformFeeLamports: platformFee.toString(),
    runtimeFeeLamports: runtimeFee.toString(),
    workerPayoutLamports: workerPayout.toString(),
  };
};
