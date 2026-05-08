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
}

export class MockSettlementAdapter implements SettlementAdapter {
  constructor(
    private readonly config: SettlementConfig = DEFAULT_SETTLEMENT_CONFIG,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async lockEscrow(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<EscrowLock> {
    const txSignature = `${this.config.lockTxPrefix}_${task.id}`;
    const escrowAccount = `${this.config.escrowAccountPrefix}_${task.id}`;
    return {
      escrowAccount,
      txSignature,
      events: [
        this.event(task.id, "escrow_locked", task.paymentLamports, wallets.hirerWallet, escrowAccount, txSignature),
      ],
    };
  }

  async releasePayout(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<SettlementOutcome> {
    const txSignature = `${this.config.payoutTxPrefix}_${task.id}`;
    const events: SettlementEvent[] = [
      this.event(task.id, "worker_paid", task.workerPayoutLamports, task.escrowAccount, wallets.workerWallet, txSignature),
    ];
    if (BigInt(task.platformFeeLamports) > 0n) {
      events.push(this.event(task.id, "platform_fee_paid", task.platformFeeLamports, task.escrowAccount, this.config.protocolFeeWallet, txSignature));
    }
    if (BigInt(task.runtimeFeeLamports) > 0n) {
      events.push(this.event(task.id, "runtime_fee_paid", task.runtimeFeeLamports, task.escrowAccount, this.config.runtimeFeeWallet, txSignature));
    }
    return { txSignature, events };
  }

  async refund(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<SettlementOutcome> {
    const txSignature = `${this.config.refundTxPrefix}_${task.id}`;
    return {
      txSignature,
      events: [
        this.event(task.id, "hirer_refunded", task.paymentLamports, task.escrowAccount, wallets.hirerWallet, txSignature),
      ],
    };
  }

  private event(
    taskId: string,
    eventType: SettlementEvent["eventType"],
    amountLamports: string,
    fromWallet: string | null,
    toWallet: string | null,
    txSignature: string,
  ): SettlementEvent {
    return {
      id: `set_${eventType}_${taskId}_${amountLamports}`,
      taskId,
      eventType,
      amountLamports,
      fromWallet,
      toWallet,
      txSignature,
      createdAt: this.now(),
    };
  }
}
