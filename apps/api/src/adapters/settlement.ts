import { DEFAULT_SETTLEMENT_CONFIG, type SettlementConfig } from "../config";
import type { SettlementEvent, Task } from "../types";

export type EscrowLock = {
  escrowAccount: string;
  txSignature: string;
  events: SettlementEvent[];
};

export type SettlementOutcome = {
  txSignature: string;
  events: SettlementEvent[];
};

export interface SettlementAdapter {
  lockEscrow(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<EscrowLock>;
  releasePayout(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<SettlementOutcome>;
  refund(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<SettlementOutcome>;
  recordFailure(task: Task, reason: string): Promise<SettlementOutcome>;
}

export function createSettlementAdapter(config: SettlementConfig = DEFAULT_SETTLEMENT_CONFIG): SettlementAdapter {
  const { SolanaSettlementAdapter } = require("@omniclaw/solana-client");
  const solanaAdapter = new SolanaSettlementAdapter({
    rpcUrl: config.solanaRpcUrl!,
    programId: config.solanaProgramId!,
    commitment: config.solanaCommitment ?? "confirmed",
    platformFeeWallet: config.solanaPlatformFeeWallet!,
    runtimeFeeWallet: config.solanaRuntimeFeeWallet!,
    platformFeeBps: config.platformFeeBps,
    runtimeFeeBps: config.runtimeFeeBps,
  });

  const now = () => new Date().toISOString();

  const toSettlementEvents = (events: any[]): SettlementEvent[] =>
    events.map((e) => ({
      id: `set_${e.eventType}_${e.taskId}_${e.amountLamports}`,
      taskId: e.taskId,
      eventType: e.eventType,
      amountLamports: e.amountLamports,
      fromWallet: e.fromWallet,
      toWallet: e.toWallet,
      txSignature: e.txSignature,
      failureReason: null,
      confirmationStatus: "confirmed",
      createdAt: now(),
    }));

  return {
    async lockEscrow(task, wallets) {
      const result = await solanaAdapter.lockEscrow({
        taskId: task.id,
        paymentLamports: task.paymentLamports,
        deadline: task.deadline,
        hirerWallet: wallets.hirerWallet,
        workerWallet: wallets.workerWallet,
      });
      return {
        escrowAccount: result.escrowAccount!,
        txSignature: result.txSignature,
        events: toSettlementEvents(result.events),
      };
    },
    async releasePayout(task, wallets) {
      const result = await solanaAdapter.releasePayout({
        taskId: task.id,
        hirerWallet: wallets.hirerWallet,
        workerWallet: wallets.workerWallet,
        escrowAccount: task.escrowAccount,
        workerPayoutLamports: task.workerPayoutLamports,
        platformFeeLamports: task.platformFeeLamports,
        runtimeFeeLamports: task.runtimeFeeLamports,
      });
      return {
        txSignature: result.txSignature,
        events: toSettlementEvents(result.events),
      };
    },
    async refund(task, wallets) {
      const result = await solanaAdapter.refund({
        taskId: task.id,
        hirerWallet: wallets.hirerWallet,
        workerWallet: wallets.workerWallet,
        escrowAccount: task.escrowAccount,
      });
      return {
        txSignature: result.txSignature,
        events: toSettlementEvents(result.events),
      };
    },
    async recordFailure(task, reason) {
      const txSignature = `settlement_failed_${task.id}_${Date.now()}`;
      return {
        txSignature,
        events: [{
          id: `set_settlement_failed_${task.id}_0`,
          taskId: task.id,
          eventType: "settlement_failed" as const,
          amountLamports: "0",
          fromWallet: task.escrowAccount,
          toWallet: null,
          txSignature,
          failureReason: reason,
          confirmationStatus: "confirmed",
          createdAt: now(),
        }],
      };
    },
  };
}
