import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { EscrowClient } from "./client";
import type { SolanaSettlementConfig } from "./config";

export interface LockEscrowParams {
  taskId: string;
  paymentLamports: string;
  deadline: string;
  hirerWallet: string;
  workerWallet: string;
}

export interface SettlementTxParams {
  taskId: string;
  hirerWallet: string;
  workerWallet: string;
  escrowAccount?: string;
  workerPayoutLamports?: string;
  platformFeeLamports?: string;
  runtimeFeeLamports?: string;
}

export interface SolanaSettlementResult {
  txSignature: string;
  escrowAccount?: string;
  events: SolanaSettlementEvent[];
}

export interface SolanaSettlementEvent {
  taskId: string;
  eventType: string;
  amountLamports: string;
  fromWallet: string | null;
  toWallet: string | null;
  txSignature: string;
}

export class SolanaSettlementAdapter {
  private client: EscrowClient;
  private config: SolanaSettlementConfig;

  constructor(config: SolanaSettlementConfig, wallet: Wallet) {
    this.config = config;
    const connection = new Connection(config.rpcUrl, config.commitment);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: config.commitment,
    });
    this.client = new EscrowClient(provider, config);
  }

  async lockEscrow(params: LockEscrowParams): Promise<SolanaSettlementResult> {
    const taskIdBytes = this.taskIdToBytes(params.taskId);
    const [escrowPda] = this.client.getEscrowPda(taskIdBytes);

    await this.client.initialize({
      taskId: taskIdBytes,
      hirer: new PublicKey(params.hirerWallet),
      worker: new PublicKey(params.workerWallet),
      amount: Number(params.paymentLamports),
      deadline: Math.floor(new Date(params.deadline).getTime() / 1000),
    });

    const fundTx = await this.client.fund({
      taskId: taskIdBytes,
      hirer: new PublicKey(params.hirerWallet),
    });

    return {
      txSignature: fundTx,
      escrowAccount: escrowPda.toBase58(),
      events: [{
        taskId: params.taskId,
        eventType: "escrow_locked",
        amountLamports: params.paymentLamports,
        fromWallet: params.hirerWallet,
        toWallet: escrowPda.toBase58(),
        txSignature: fundTx,
      }],
    };
  }

  async releasePayout(params: SettlementTxParams): Promise<SolanaSettlementResult> {
    const taskIdBytes = this.taskIdToBytes(params.taskId);

    const tx = await this.client.release({
      taskId: taskIdBytes,
      authority: new PublicKey(params.hirerWallet),
      worker: new PublicKey(params.workerWallet),
    });

    const events: SolanaSettlementEvent[] = [{
      taskId: params.taskId,
      eventType: "worker_paid",
      amountLamports: params.workerPayoutLamports || "0",
      fromWallet: params.escrowAccount || null,
      toWallet: params.workerWallet,
      txSignature: tx,
    }];

    if (params.platformFeeLamports && BigInt(params.platformFeeLamports) > 0n) {
      events.push({
        taskId: params.taskId,
        eventType: "platform_fee_paid",
        amountLamports: params.platformFeeLamports,
        fromWallet: params.escrowAccount || null,
        toWallet: this.config.platformFeeWallet,
        txSignature: tx,
      });
    }

    if (params.runtimeFeeLamports && BigInt(params.runtimeFeeLamports) > 0n) {
      events.push({
        taskId: params.taskId,
        eventType: "runtime_fee_paid",
        amountLamports: params.runtimeFeeLamports,
        fromWallet: params.escrowAccount || null,
        toWallet: this.config.runtimeFeeWallet,
        txSignature: tx,
      });
    }

    return { txSignature: tx, events };
  }

  async refund(params: SettlementTxParams): Promise<SolanaSettlementResult> {
    const taskIdBytes = this.taskIdToBytes(params.taskId);

    const tx = await this.client.refund({
      taskId: taskIdBytes,
      hirer: new PublicKey(params.hirerWallet),
    });

    return {
      txSignature: tx,
      events: [{
        taskId: params.taskId,
        eventType: "hirer_refunded",
        amountLamports: params.workerPayoutLamports || "0",
        fromWallet: params.escrowAccount || null,
        toWallet: params.hirerWallet,
        txSignature: tx,
      }],
    };
  }

  private taskIdToBytes(taskId: string): Uint8Array {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(taskId);
    const result = new Uint8Array(32);
    result.set(bytes.slice(0, 32));
    return result;
  }
}
