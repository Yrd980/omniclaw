import { AnchorProvider, BN, Program, web3, type Idl } from "@coral-xyz/anchor";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SOLANA_PROGRAM_ID } from "./solana-contract";
import type { EscrowLock, SettlementAdapter, SettlementOutcome } from "./settlement";
import type { SettlementEvent, Task } from "../types";

type AnchorWallet = {
  publicKey: web3.PublicKey;
  signTransaction<T extends web3.Transaction | web3.VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends web3.Transaction | web3.VersionedTransaction>(txs: T[]): Promise<T[]>;
};

export type AnchorSettlementAdapterConfig = {
  rpcUrl: string;
  programId: string;
  commitment?: web3.Commitment;
  signerKeypairs: Record<string, web3.Keypair>;
  now?: () => string;
  idlPath?: string;
};

export class AnchorSettlementAdapter implements SettlementAdapter {
  private readonly connection: web3.Connection;
  private readonly commitment: web3.Commitment;
  private readonly signerKeypairs: Record<string, web3.Keypair>;
  private readonly now: () => string;
  private readonly idl: Idl;

  constructor(config: AnchorSettlementAdapterConfig) {
    this.commitment = config.commitment ?? "confirmed";
    this.connection = new web3.Connection(config.rpcUrl, this.commitment);
    this.signerKeypairs = config.signerKeypairs;
    this.now = config.now ?? (() => new Date().toISOString());
    this.idl = loadIdl(config.idlPath, config.programId);
  }

  async lockEscrow(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<EscrowLock> {
    const creator = this.signerFor(wallets.hirerWallet, "hirer");
    const worker = this.publicKeyFor(wallets.workerWallet, "worker");
    const workerSigner = this.signerKeypairs[worker.toBase58()];
    const agentAccount = deriveAgentAccount(worker, this.programId);

    if (!(await this.accountExists(agentAccount))) {
      if (!workerSigner) {
        throw new Error(`Anchor worker signer not configured for ${worker.toBase58()}; register the worker agent onchain first or provide its keypair`);
      }
      const workerProgram = this.programFor(workerSigner);
      await workerProgram.methods
        .registerAgent("OmniClaw Worker", "offchain task executor")
        .accountsStrict({
          agentAccount,
          owner: worker,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([workerSigner])
        .rpc();
    }

    const job = web3.Keypair.generate();
    const vault = deriveVault(job.publicKey, this.programId);
    const program = this.programFor(creator);
    const txSignature = await program.methods
      .createJob(agentAccount, new BN(task.paymentLamports), `OmniClaw ${task.id}`, `Offchain task ${task.id}`)
      .accountsStrict({
        jobAccount: job.publicKey,
        creator: creator.publicKey,
        agentAccount,
        vault,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([job])
      .rpc();

    return {
      escrowAccount: job.publicKey.toBase58(),
      txSignature,
      events: [
        this.event(task.id, "escrow_locked", task.paymentLamports, creator.publicKey.toBase58(), vault.toBase58(), txSignature),
      ],
    };
  }

  async releasePayout(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<SettlementOutcome> {
    const jobAccount = this.jobAccount(task);
    const creator = this.signerFor(wallets.hirerWallet, "hirer");
    const worker = this.publicKeyFor(wallets.workerWallet, "worker");
    const workerSigner = this.signerFor(wallets.workerWallet, "worker");
    const agentAccount = deriveAgentAccount(worker, this.programId);
    const vault = deriveVault(jobAccount, this.programId);
    const workerProgram = this.programFor(workerSigner);

    const job = await this.fetchJob(jobAccount);
    if (job.status === STATUS_OPEN) {
      await workerProgram.methods
        .submitWork(`omniclaw://task/${task.id}/result`)
        .accountsStrict({
          jobAccount,
          agentAccount,
          agentOwner: worker,
        })
        .signers([workerSigner])
        .rpc();
    }
    if (job.status === STATUS_COMPLETED) {
      return { txSignature: `anchor_completed_${task.id}`, events: [] };
    }

    const program = this.programFor(creator);
    const txSignature = await program.methods
      .completeJob()
      .accountsStrict({
        jobAccount,
        creator: creator.publicKey,
        agentAccount,
        agentOwner: worker,
        vault,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    return {
      txSignature,
      events: [
        this.event(task.id, "worker_paid", task.paymentLamports, vault.toBase58(), worker.toBase58(), txSignature),
      ],
    };
  }

  async refund(task: Task, wallets: { hirerWallet: string; workerWallet: string }): Promise<SettlementOutcome> {
    const jobAccount = this.jobAccount(task);
    const creator = this.signerFor(wallets.hirerWallet, "hirer");
    const worker = this.publicKeyFor(wallets.workerWallet, "worker");
    const agentAccount = deriveAgentAccount(worker, this.programId);
    const vault = deriveVault(jobAccount, this.programId);
    const job = await this.fetchJob(jobAccount);

    if (job.status === STATUS_CANCELLED || job.status === STATUS_SLASHED) {
      return { txSignature: `anchor_refunded_${task.id}`, events: [] };
    }

    const program = this.programFor(creator);
    const txSignature = job.status === STATUS_OPEN
      ? await program.methods
        .cancelJob()
        .accountsStrict({
          jobAccount,
          creator: creator.publicKey,
          vault,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc()
      : await program.methods
        .slashAgent()
        .accountsStrict({
          jobAccount,
          agentAccount,
          creator: creator.publicKey,
          vault,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

    return {
      txSignature,
      events: [
        this.event(task.id, "hirer_refunded", task.paymentLamports, vault.toBase58(), creator.publicKey.toBase58(), txSignature),
      ],
    };
  }

  async recordFailure(task: Task, reason: string): Promise<SettlementOutcome> {
    const txSignature = `anchor_settlement_failed_${task.id}`;
    return {
      txSignature,
      events: [
        this.event(task.id, "settlement_failed", "0", task.escrowAccount, null, txSignature, reason),
      ],
    };
  }

  private get programId() {
    return new web3.PublicKey(this.idl.address ?? DEFAULT_SOLANA_PROGRAM_ID);
  }

  private programFor(signer: web3.Keypair) {
    return new Program(this.idl, new AnchorProvider(this.connection, walletFor(signer), { commitment: this.commitment }));
  }

  private signerFor(wallet: string, role: string) {
    const publicKey = this.publicKeyFor(wallet, role);
    const signer = this.signerKeypairs[publicKey.toBase58()];
    if (!signer) {
      throw new Error(`Anchor ${role} signer not configured for ${publicKey.toBase58()}`);
    }
    return signer;
  }

  private publicKeyFor(wallet: string, role: string) {
    try {
      return new web3.PublicKey(wallet);
    } catch {
      throw new Error(`Anchor ${role} wallet must be a valid Solana public key`);
    }
  }

  private jobAccount(task: Task) {
    if (!task.escrowAccount) {
      throw new Error(`Task ${task.id} does not have an Anchor job account`);
    }
    return this.publicKeyFor(task.escrowAccount, "job");
  }

  private async fetchJob(jobAccount: web3.PublicKey): Promise<{ status: number }> {
    const program = this.programFor(anySigner(this.signerKeypairs)) as Program & {
      account: { jobAccount: { fetch(publicKey: web3.PublicKey): Promise<{ status: number }> } };
    };
    return await program.account.jobAccount.fetch(jobAccount);
  }

  private async accountExists(publicKey: web3.PublicKey) {
    return (await this.connection.getAccountInfo(publicKey, this.commitment)) !== null;
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
      id: `set_${eventType}_${taskId}_${txSignature}`,
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

export const parseSignerKeypairs = (raw: string | undefined): Record<string, web3.Keypair> => {
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(parsed).map(([publicKey, value]) => {
    const secret = Array.isArray(value) ? value : JSON.parse(readFileSync(String(value), "utf8"));
    const keypair = web3.Keypair.fromSecretKey(Uint8Array.from(secret as number[]));
    if (keypair.publicKey.toBase58() !== publicKey) {
      throw new Error(`Anchor signer keypair does not match configured public key ${publicKey}`);
    }
    return [publicKey, keypair];
  }));
};

const STATUS_OPEN = 0;
const STATUS_COMPLETED = 2;
const STATUS_CANCELLED = 3;
const STATUS_SLASHED = 4;

const deriveAgentAccount = (owner: web3.PublicKey, programId: web3.PublicKey) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from("agent"), owner.toBuffer()], programId)[0];

const deriveVault = (job: web3.PublicKey, programId: web3.PublicKey) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from("vault"), job.toBuffer()], programId)[0];

const walletFor = (keypair: web3.Keypair): AnchorWallet => {
  const signTransaction = async <T extends web3.Transaction | web3.VersionedTransaction>(tx: T): Promise<T> => {
    if (tx instanceof web3.VersionedTransaction) {
      tx.sign([keypair]);
      return tx;
    }
    tx.partialSign(keypair);
    return tx;
  };
  return {
    publicKey: keypair.publicKey,
    signTransaction,
    async signAllTransactions(txs) {
      return Promise.all(txs.map((tx) => signTransaction(tx)));
    },
  };
};

const anySigner = (signers: Record<string, web3.Keypair>) => {
  const signer = Object.values(signers)[0];
  if (!signer) {
    throw new Error("Anchor signer keypairs are not configured");
  }
  return signer;
};

const loadIdl = (idlPath: string | undefined, programId: string): Idl => {
  const path = idlPath ?? resolve(fileURLToPath(new URL("../../../../../contracts/solana/target/idl/omniclaw.json", import.meta.url)));
  const idl = JSON.parse(readFileSync(path, "utf8")) as Idl & { address?: string };
  idl.address = programId;
  return idl;
};
