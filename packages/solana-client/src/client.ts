import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { SolanaSettlementConfig } from "./config";

export class EscrowClient {
  private program: Program;
  private config: SolanaSettlementConfig;

  constructor(provider: anchor.AnchorProvider, config: SolanaSettlementConfig) {
    this.config = config;
    this.program = new Program(
      { address: new PublicKey(config.programId), idl: {} as any },
      { provider }
    );
  }

  getEscrowPda(taskId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(taskId)],
      new PublicKey(this.config.programId)
    );
  }

  async initialize(params: {
    taskId: Uint8Array;
    hirer: PublicKey;
    worker: PublicKey;
    amount: number;
    deadline: number;
  }): Promise<string> {
    const [escrow] = this.getEscrowPda(params.taskId);
    const tx = await this.program.methods
      .initializeTaskEscrow(
        Array.from(params.taskId),
        new BN(params.amount),
        this.config.platformFeeBps,
        this.config.runtimeFeeBps,
        new BN(params.deadline)
      )
      .accounts({
        escrow,
        hirer: params.hirer,
        worker: params.worker,
        platformWallet: new PublicKey(this.config.platformFeeWallet),
        runtimeWallet: new PublicKey(this.config.runtimeFeeWallet),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return tx;
  }

  async fund(params: { taskId: Uint8Array; hirer: PublicKey }): Promise<string> {
    const [escrow] = this.getEscrowPda(params.taskId);
    const tx = await this.program.methods
      .fundEscrow()
      .accounts({ escrow, hirer: params.hirer, systemProgram: SystemProgram.programId })
      .rpc();
    return tx;
  }

  async accept(params: { taskId: Uint8Array; worker: PublicKey }): Promise<string> {
    const [escrow] = this.getEscrowPda(params.taskId);
    const tx = await this.program.methods
      .acceptTask()
      .accounts({ escrow, worker: params.worker })
      .rpc();
    return tx;
  }

  async release(params: {
    taskId: Uint8Array;
    authority: PublicKey;
    worker: PublicKey;
  }): Promise<string> {
    const [escrow] = this.getEscrowPda(params.taskId);
    const tx = await this.program.methods
      .releasePayout()
      .accounts({
        escrow,
        authority: params.authority,
        worker: params.worker,
        platformWallet: new PublicKey(this.config.platformFeeWallet),
        runtimeWallet: new PublicKey(this.config.runtimeFeeWallet),
      })
      .rpc();
    return tx;
  }

  async refund(params: { taskId: Uint8Array; hirer: PublicKey }): Promise<string> {
    const [escrow] = this.getEscrowPda(params.taskId);
    const tx = await this.program.methods
      .refund()
      .accounts({ escrow, hirer: params.hirer })
      .rpc();
    return tx;
  }

  async openDispute(params: { taskId: Uint8Array; caller: PublicKey }): Promise<string> {
    const [escrow] = this.getEscrowPda(params.taskId);
    const tx = await this.program.methods
      .openDispute()
      .accounts({ escrow, caller: params.caller })
      .rpc();
    return tx;
  }

  async resolveDispute(params: {
    taskId: Uint8Array;
    evaluator: PublicKey;
    worker: PublicKey;
    hirer: PublicKey;
    releaseToWorker: boolean;
  }): Promise<string> {
    const [escrow] = this.getEscrowPda(params.taskId);
    const tx = await this.program.methods
      .resolveDispute(params.releaseToWorker)
      .accounts({
        escrow,
        evaluator: params.evaluator,
        worker: params.worker,
        hirer: params.hirer,
        platformWallet: new PublicKey(this.config.platformFeeWallet),
        runtimeWallet: new PublicKey(this.config.runtimeFeeWallet),
      })
      .rpc();
    return tx;
  }
}
