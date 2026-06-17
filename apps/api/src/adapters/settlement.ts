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

export class MockSettlementAdapter implements SettlementAdapter {
  private readonly lockedTaskIds = new Set<string>();
  private readonly paidTaskIds = new Set<string>();
  private readonly refundedTaskIds = new Set<string>();
  private readonly failedTaskReasons = new Map<string, string>();

  constructor(
    private readonly config: SettlementConfig = DEFAULT_SETTLEMENT_CONFIG,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async lockEscrow(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<EscrowLock> {
    const txSignature = `${this.config.lockTxPrefix}_${task.id}`;
    const escrowAccount = `${this.config.escrowAccountPrefix}_${task.id}`;
    if (this.lockedTaskIds.has(task.id)) {
      return { escrowAccount, txSignature, events: [] };
    }
    this.lockedTaskIds.add(task.id);
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
    if (this.paidTaskIds.has(task.id)) {
      return { txSignature, events: [] };
    }
    this.paidTaskIds.add(task.id);
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
    if (this.refundedTaskIds.has(task.id)) {
      return { txSignature, events: [] };
    }
    this.refundedTaskIds.add(task.id);
    return {
      txSignature,
      events: [
        this.event(task.id, "hirer_refunded", task.paymentLamports, task.escrowAccount, wallets.hirerWallet, txSignature),
      ],
    };
  }

  async recordFailure(task: Task, reason: string): Promise<SettlementOutcome> {
    const txSignature = `mock_settlement_failed_${task.id}`;
    if (this.failedTaskReasons.has(task.id)) {
      return { txSignature, events: [] };
    }
    this.failedTaskReasons.set(task.id, reason);
    return {
      txSignature,
      events: [
        this.event(task.id, "settlement_failed", "0", task.escrowAccount, null, txSignature, reason),
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
    failureReason: string | null = null,
  ): SettlementEvent {
    return {
      id: `set_${eventType}_${taskId}_${amountLamports}`,
      taskId,
      eventType,
      amountLamports,
      fromWallet,
      toWallet,
      txSignature,
      failureReason,
      createdAt: this.now(),
    };
  }
}

export class SolanaTestnetSettlementAdapter implements SettlementAdapter {
  async lockEscrow(): Promise<EscrowLock> {
    throw new Error("solana_testnet settlement adapter is not implemented; configure OMNICLAW_SETTLEMENT_ADAPTER=mock for local execution");
  }

  async releasePayout(): Promise<SettlementOutcome> {
    throw new Error("solana_testnet settlement adapter is not implemented; no Solana escrow release was attempted");
  }

  async refund(): Promise<SettlementOutcome> {
    throw new Error("solana_testnet settlement adapter is not implemented; no Solana refund was attempted");
  }

  async recordFailure(task: Task, reason: string): Promise<SettlementOutcome> {
    return {
      txSignature: `solana_testnet_unimplemented_${task.id}`,
      events: [
        {
          id: `set_settlement_failed_${task.id}_0`,
          taskId: task.id,
          eventType: "settlement_failed",
          amountLamports: "0",
          fromWallet: task.escrowAccount,
          toWallet: null,
          txSignature: `solana_testnet_unimplemented_${task.id}`,
          failureReason: reason,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }
}
