# Solana Settlement Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real Solana Anchor escrow program and TypeScript adapter to replace the mock settlement layer, deployed to devnet.

**Architecture:** PDA-based escrow state machine on Solana with 7 instructions (initialize, fund, accept, release, refund, open_dispute, resolve_dispute). TypeScript adapter in `packages/solana-client/` implements the existing `SettlementAdapter` interface. Config switch in `apps/api` selects mock vs devnet adapter.

**Tech Stack:** Rust, Anchor 0.30+, TypeScript, @coral-xyz/anchor, @solana/web3.js

## Global Constraints

- SOL-only — no SPL token support
- Devnet only — no mainnet deployment
- On-chain state minimal per ADR-0001 — payloads stay offchain
- No test suite in this phase
- Existing `SettlementAdapter` interface must not change
- Mock adapter remains default (`OMNICLAW_SETTLEMENT_ADAPTER=mock`)

---

### Task 1: Anchor Program Scaffold and State Definitions

**Covers:** S3, S5

**Files:**
- Create: `programs/escrow/Anchor.toml`
- Create: `programs/escrow/Cargo.toml`
- Create: `programs/escrow/src/lib.rs`
- Create: `programs/escrow/src/state.rs`
- Create: `programs/escrow/src/errors.rs`
- Create: `programs/escrow/src/instructions/mod.rs`

- [ ] **Step 1: Create Anchor.toml**

```toml
[features]
seeds = false
skip-lint = false

[programs.localnet]
omniclaw_escrow = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

[programs.devnet]
omniclaw_escrow = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "echo \"No tests configured\""
```

Note: The program ID `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` is a placeholder. After `anchor build`, replace with the actual keypair-derived ID.

- [ ] **Step 2: Create Cargo.toml**

```toml
[package]
name = "omniclaw-escrow"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "omniclaw_escrow"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.30.1"
```

- [ ] **Step 3: Create `src/state.rs`**

```rust
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowStatus {
    Initialized,
    Funded,
    Accepted,
    Disputed,
    Released,
    Refunded,
}

#[account]
pub struct EscrowAccount {
    pub task_id: [u8; 32],
    pub hirer: Pubkey,
    pub worker: Pubkey,
    pub amount: u64,
    pub platform_fee_bps: u16,
    pub runtime_fee_bps: u16,
    pub platform_wallet: Pubkey,
    pub runtime_wallet: Pubkey,
    pub deadline: i64,
    pub status: EscrowStatus,
    pub bump: u8,
}

impl EscrowAccount {
    pub const LEN: usize = 8   // discriminator
        + 32                     // task_id
        + 32                     // hirer
        + 32                     // worker
        + 8                      // amount
        + 2                      // platform_fee_bps
        + 2                      // runtime_fee_bps
        + 32                     // platform_wallet
        + 32                     // runtime_wallet
        + 8                      // deadline
        + 1                      // status (enum)
        + 1;                     // bump
}
```

- [ ] **Step 4: Create `src/errors.rs`**

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Escrow is already funded")]
    EscrowAlreadyFunded,
    #[msg("Invalid status transition")]
    InvalidStatusTransition,
    #[msg("Unauthorized signer")]
    UnauthorizedSigner,
    #[msg("Deadline has not passed")]
    DeadlineNotPassed,
    #[msg("Insufficient funds for payout and fees")]
    InsufficientFunds,
    #[msg("Dispute is already open")]
    DisputeAlreadyOpen,
    #[msg("Invalid fee configuration: total bps exceeds 10000")]
    InvalidFeeConfiguration,
}
```

- [ ] **Step 5: Create `src/instructions/mod.rs`**

```rust
pub mod initialize;
pub mod fund;
pub mod accept;
pub mod release;
pub mod refund;
pub mod open_dispute;
pub mod resolve_dispute;

pub use initialize::*;
pub use fund::*;
pub use accept::*;
pub use release::*;
pub use refund::*;
pub use open_dispute::*;
pub use resolve_dispute::*;
```

- [ ] **Step 6: Create `src/lib.rs`**

```rust
use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod instructions;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod omniclaw_escrow {
    use super::*;

    pub fn initialize_task_escrow(
        ctx: Context<InitializeTaskEscrow>,
        task_id: [u8; 32],
        amount: u64,
        platform_fee_bps: u16,
        runtime_fee_bps: u16,
        deadline: i64,
    ) -> Result<()> {
        initialize::handler(ctx, task_id, amount, platform_fee_bps, runtime_fee_bps, deadline)
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        fund::handler(ctx)
    }

    pub fn accept_task(ctx: Context<AcceptTask>) -> Result<()> {
        accept::handler(ctx)
    }

    pub fn release_payout(ctx: Context<ReleasePayout>) -> Result<()> {
        release::handler(ctx)
    }

    pub fn refund(ctx: Context<RefundEscrow>) -> Result<()> {
        refund::handler(ctx)
    }

    pub fn open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
        open_dispute::handler(ctx)
    }

    pub fn resolve_dispute(ctx: Context<ResolveDispute>, release_to_worker: bool) -> Result<()> {
        resolve_dispute::handler(ctx, release_to_worker)
    }
}
```

- [ ] **Step 7: Verify scaffold compiles**

Run: `cd programs/escrow && cargo check`
Expected: Compilation errors about missing instruction modules — this is expected since instructions aren't implemented yet. The scaffold structure is valid.

---

### Task 2: Core Instructions — Initialize and Fund

**Covers:** S3

**Files:**
- Create: `programs/escrow/src/instructions/initialize.rs`
- Create: `programs/escrow/src/instructions/fund.rs`

- [ ] **Step 1: Create `instructions/initialize.rs`**

```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
#[instruction(task_id: [u8; 32])]
pub struct InitializeTaskEscrow<'info> {
    #[account(
        init,
        payer = hirer,
        space = EscrowAccount::LEN,
        seeds = [b"escrow", task_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub hirer: Signer<'info>,

    /// CHECK: Worker wallet, validated at runtime
    pub worker: AccountInfo<'info>,

    /// CHECK: Platform fee wallet, validated at runtime
    pub platform_wallet: AccountInfo<'info>,

    /// CHECK: Runtime fee wallet, validated at runtime
    pub runtime_wallet: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeTaskEscrow>,
    task_id: [u8; 32],
    amount: u64,
    platform_fee_bps: u16,
    runtime_fee_bps: u16,
    deadline: i64,
) -> Result<()> {
    require!(
        (platform_fee_bps as u32 + runtime_fee_bps as u32) <= 10000,
        EscrowError::InvalidFeeConfiguration
    );

    let escrow = &mut ctx.accounts.escrow;
    escrow.task_id = task_id;
    escrow.hirer = ctx.accounts.hirer.key();
    escrow.worker = ctx.accounts.worker.key();
    escrow.amount = amount;
    escrow.platform_fee_bps = platform_fee_bps;
    escrow.runtime_fee_bps = runtime_fee_bps;
    escrow.platform_wallet = ctx.accounts.platform_wallet.key();
    escrow.runtime_wallet = ctx.accounts.runtime_wallet.key();
    escrow.deadline = deadline;
    escrow.status = EscrowStatus::Initialized;
    escrow.bump = ctx.bumps.escrow;

    Ok(())
}
```

- [ ] **Step 2: Create `instructions/fund.rs`**

```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.hirer == hirer.key() @ EscrowError::UnauthorizedSigner,
        constraint = escrow.status == EscrowStatus::Initialized @ EscrowError::InvalidStatusTransition,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub hirer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FundEscrow>) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    let amount = escrow.amount;

    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.hirer.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, amount)?;

    ctx.accounts.escrow.status = EscrowStatus::Funded;

    Ok(())
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd programs/escrow && cargo check`
Expected: Compiles successfully (warnings about unused imports acceptable).

---

### Task 3: Worker and Payout Instructions — Accept, Release, Refund

**Covers:** S3

**Files:**
- Create: `programs/escrow/src/instructions/accept.rs`
- Create: `programs/escrow/src/instructions/release.rs`
- Create: `programs/escrow/src/instructions/refund.rs`

- [ ] **Step 1: Create `instructions/accept.rs`**

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct AcceptTask<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.worker == worker.key() @ EscrowError::UnauthorizedSigner,
        constraint = escrow.status == EscrowStatus::Funded @ EscrowError::InvalidStatusTransition,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub worker: Signer<'info>,
}

pub fn handler(ctx: Context<AcceptTask>) -> Result<()> {
    ctx.accounts.escrow.status = EscrowStatus::Accepted;
    Ok(())
}
```

- [ ] **Step 2: Create `instructions/release.rs`**

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct ReleasePayout<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.hirer == authority.key() @ EscrowError::UnauthorizedSigner,
        constraint = escrow.status == EscrowStatus::Accepted
            @ EscrowError::InvalidStatusTransition,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub authority: Signer<'info>,

    /// CHECK: Worker wallet receives payout
    #[account(mut)]
    pub worker: AccountInfo<'info>,

    /// CHECK: Platform wallet receives fee
    #[account(mut)]
    pub platform_wallet: AccountInfo<'info>,

    /// CHECK: Runtime wallet receives fee
    #[account(mut)]
    pub runtime_wallet: AccountInfo<'info>,
}

pub fn handler(ctx: Context<ReleasePayout>) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    let total = escrow.amount;

    let platform_fee = total
        .checked_mul(escrow.platform_fee_bps as u64)
        .unwrap()
        .checked_div(10000)
        .unwrap();
    let runtime_fee = total
        .checked_mul(escrow.runtime_fee_bps as u64)
        .unwrap()
        .checked_div(10000)
        .unwrap();
    let worker_payout = total
        .checked_sub(platform_fee)
        .unwrap()
        .checked_sub(runtime_fee)
        .unwrap();

    // Transfer worker payout
    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= worker_payout;
    **ctx.accounts.worker.try_borrow_mut_lamports()? += worker_payout;

    // Transfer platform fee
    if platform_fee > 0 {
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
        **ctx.accounts.platform_wallet.try_borrow_mut_lamports()? += platform_fee;
    }

    // Transfer runtime fee
    if runtime_fee > 0 {
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= runtime_fee;
        **ctx.accounts.runtime_wallet.try_borrow_mut_lamports()? += runtime_fee;
    }

    ctx.accounts.escrow.status = EscrowStatus::Released;

    Ok(())
}
```

- [ ] **Step 3: Create `instructions/refund.rs`**

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.hirer == hirer.key() @ EscrowError::UnauthorizedSigner,
        constraint = escrow.status == EscrowStatus::Funded
            || escrow.status == EscrowStatus::Accepted
            @ EscrowError::InvalidStatusTransition,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub hirer: Signer<'info>,
}

pub fn handler(ctx: Context<RefundEscrow>) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    let amount = escrow.amount;

    **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.hirer.try_borrow_mut_lamports()? += amount;

    ctx.accounts.escrow.status = EscrowStatus::Refunded;

    Ok(())
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd programs/escrow && cargo check`
Expected: Compiles successfully.

---

### Task 4: Dispute Instructions — Open and Resolve

**Covers:** S3

**Files:**
- Create: `programs/escrow/src/instructions/open_dispute.rs`
- Create: `programs/escrow/src/instructions/resolve_dispute.rs`

- [ ] **Step 1: Create `instructions/open_dispute.rs`**

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.hirer == caller.key() || escrow.worker == caller.key()
            @ EscrowError::UnauthorizedSigner,
        constraint = escrow.status == EscrowStatus::Accepted @ EscrowError::InvalidStatusTransition,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub caller: Signer<'info>,
}

pub fn handler(ctx: Context<OpenDispute>) -> Result<()> {
    ctx.accounts.escrow.status = EscrowStatus::Disputed;
    Ok(())
}
```

- [ ] **Step 2: Create `instructions/resolve_dispute.rs`**

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.status == EscrowStatus::Disputed @ EscrowError::InvalidStatusTransition,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    /// CHECK: Evaluator authority — any signer can resolve for devnet
    pub evaluator: Signer<'info>,

    /// CHECK: Worker wallet
    #[account(mut)]
    pub worker: AccountInfo<'info>,

    /// CHECK: Hirer wallet
    #[account(mut)]
    pub hirer: AccountInfo<'info>,

    /// CHECK: Platform wallet
    #[account(mut)]
    pub platform_wallet: AccountInfo<'info>,

    /// CHECK: Runtime wallet
    #[account(mut)]
    pub runtime_wallet: AccountInfo<'info>,
}

pub fn handler(ctx: Context<ResolveDispute>, release_to_worker: bool) -> Result<()> {
    let escrow = &ctx.accounts.escrow;
    let total = escrow.amount;

    if release_to_worker {
        let platform_fee = total
            .checked_mul(escrow.platform_fee_bps as u64)
            .unwrap()
            .checked_div(10000)
            .unwrap();
        let runtime_fee = total
            .checked_mul(escrow.runtime_fee_bps as u64)
            .unwrap()
            .checked_div(10000)
            .unwrap();
        let worker_payout = total
            .checked_sub(platform_fee)
            .unwrap()
            .checked_sub(runtime_fee)
            .unwrap();

        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= worker_payout;
        **ctx.accounts.worker.try_borrow_mut_lamports()? += worker_payout;

        if platform_fee > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
            **ctx.accounts.platform_wallet.try_borrow_mut_lamports()? += platform_fee;
        }

        if runtime_fee > 0 {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= runtime_fee;
            **ctx.accounts.runtime_wallet.try_borrow_mut_lamports()? += runtime_fee;
        }
    } else {
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= total;
        **ctx.accounts.hirer.try_borrow_mut_lamports()? += total;
    }

    ctx.accounts.escrow.status = if release_to_worker {
        EscrowStatus::Released
    } else {
        EscrowStatus::Refunded
    };

    Ok(())
}
```

- [ ] **Step 3: Verify full program compilation**

Run: `cd programs/escrow && cargo check`
Expected: Compiles successfully with all 7 instructions wired.

---

### Task 5: TypeScript Client Package

**Covers:** S4, S5

**Files:**
- Create: `packages/solana-client/package.json`
- Create: `packages/solana-client/tsconfig.json`
- Create: `packages/solana-client/src/index.ts`
- Create: `packages/solana-client/src/config.ts`
- Create: `packages/solana-client/src/client.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@omniclaw/solana-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/web3.js": "^1.95.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `src/config.ts`**

```typescript
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
```

- [ ] **Step 4: Create `src/client.ts`**

```typescript
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
```

- [ ] **Step 5: Create `src/index.ts`**

```typescript
export { EscrowClient } from "./client";
export type { SolanaSettlementConfig } from "./config";
export { DEFAULT_SOLANA_CONFIG } from "./config";
```

- [ ] **Step 6: Install dependencies**

Run: `bun install` from project root
Expected: `@coral-xyz/anchor` and `@solana/web3.js` added to workspace.

---

### Task 6: Settlement Adapter Implementation

**Covers:** S4, S8

**Files:**
- Create: `packages/solana-client/src/adapter.ts`
- Modify: `apps/api/src/adapters/settlement.ts` (add import/export)

- [ ] **Step 1: Create `src/adapter.ts`**

This adapter defines its own parameter/return types to avoid depending on `apps/api` types. The API integration layer (Task 7) handles the mapping.

```typescript
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
```

- [ ] **Step 2: Update `packages/solana-client/src/index.ts`**

```typescript
export { EscrowClient } from "./client";
export { SolanaSettlementAdapter } from "./adapter";
export type { SolanaSettlementConfig } from "./config";
export { DEFAULT_SOLANA_CONFIG } from "./config";
```

---

### Task 7: API Integration and Config Switch

**Covers:** S4, S8

**Files:**
- Modify: `apps/api/src/config.ts` (extend settlement config)
- Modify: `apps/api/src/adapters/settlement.ts` (add Solana adapter factory)

- [ ] **Step 1: Extend `apps/api/src/config.ts`**

Read the existing file first, then add Solana-specific fields to `SettlementConfig`:

```typescript
// Add to existing SettlementConfig:
solanaRpcUrl?: string;
solanaProgramId?: string;
solanaPlatformFeeWallet?: string;
solanaRuntimeFeeWallet?: string;
solanaCommitment?: "processed" | "confirmed" | "finalized";
```

Add to `DEFAULT_SETTLEMENT_CONFIG`:

```typescript
solanaRpcUrl: process.env.OMNICLAW_SOLANA_RPC_URL || "https://api.devnet.solana.com",
solanaProgramId: process.env.OMNICLAW_SOLANA_PROGRAM_ID || "",
solanaPlatformFeeWallet: process.env.OMNICLAW_SOLANA_PLATFORM_FEE_WALLET || "",
solanaRuntimeFeeWallet: process.env.OMNICLAW_SOLANA_RUNTIME_FEE_WALLET || "",
solanaCommitment: (process.env.OMNICLAW_SOLANA_COMMITMENT as any) || "confirmed",
```

- [ ] **Step 2: Add adapter factory to `apps/api/src/adapters/settlement.ts`**

Add at the bottom of the file. The factory wraps `SolanaSettlementAdapter` (which has its own types) into the existing `SettlementAdapter` interface:

```typescript
export function createSettlementAdapter(
  mode: string,
  config: SettlementConfig
): SettlementAdapter {
  if (mode === "solana_devnet") {
    const { SolanaSettlementAdapter } = require("@omniclaw/solana-client");
    const solanaAdapter = new SolanaSettlementAdapter({
      rpcUrl: config.solanaRpcUrl!,
      programId: config.solanaProgramId!,
      commitment: config.solanaCommitment!,
      platformFeeWallet: config.solanaPlatformFeeWallet!,
      runtimeFeeWallet: config.solanaRuntimeFeeWallet!,
      platformFeeBps: config.platformFeeBps,
      runtimeFeeBps: config.runtimeFeeBps,
    });

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
          events: result.events.map((e) => ({
            id: `set_${e.eventType}_${e.taskId}_${e.amountLamports}`,
            ...e,
            failureReason: null,
            createdAt: new Date().toISOString(),
          })),
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
          events: result.events.map((e) => ({
            id: `set_${e.eventType}_${e.taskId}_${e.amountLamports}`,
            ...e,
            failureReason: null,
            createdAt: new Date().toISOString(),
          })),
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
          events: result.events.map((e) => ({
            id: `set_${e.eventType}_${e.taskId}_${e.amountLamports}`,
            ...e,
            failureReason: null,
            createdAt: new Date().toISOString(),
          })),
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
            createdAt: new Date().toISOString(),
          }],
        };
      },
    };
  }
  return new MockSettlementAdapter(config);
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `bun run typecheck` from project root (if available) or `npx tsc --noEmit` in `apps/api`
Expected: No type errors.

---

### Task 8: Build and Deploy to Devnet

**Covers:** S6

**Files:**
- Modify: `programs/escrow/Anchor.toml` (update program ID after build)

- [ ] **Step 1: Build the Anchor program**

Run: `cd programs/escrow && anchor build`
Expected: Produces `target/deploy/omniclaw_escrow-keypair.json` and `target/idl/omniclaw_escrow.json`.

- [ ] **Step 2: Get the program ID**

Run: `solana address -k programs/escrow/target/deploy/omniclaw_escrow-keypair.json`
Expected: Prints a base58 program ID.

- [ ] **Step 3: Update Anchor.toml with real program ID**

Replace the placeholder `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` with the output from Step 2 in both `[programs.localnet]` and `[programs.devnet]` sections.

Also update `declare_id!()` in `programs/escrow/src/lib.rs` with the same ID.

- [ ] **Step 4: Rebuild with correct ID**

Run: `cd programs/escrow && anchor build`
Expected: Build succeeds with the correct program ID.

- [ ] **Step 5: Airdrop SOL for deployment**

Run: `solana airdrop 2 --url devnet`
Expected: 2 SOL airdropped to local wallet.

- [ ] **Step 6: Deploy to devnet**

Run: `cd programs/escrow && anchor deploy --provider.cluster devnet`
Expected: Program deployed. Output includes the program ID.

- [ ] **Step 7: Copy IDL to TypeScript client**

Run: `cp programs/escrow/target/idl/omniclaw_escrow.json packages/solana-client/src/idl/omniclaw_escrow.json`

- [ ] **Step 8: Set environment variables**

Add to `.env` or deployment config:

```
OMNICLAW_SETTLEMENT_ADAPTER=solana_devnet
OMNICLAW_SOLANA_RPC_URL=https://api.devnet.solana.com
OMNICLAW_SOLANA_PROGRAM_ID=<program_id_from_step_2>
OMNICLAW_SOLANA_PLATFORM_FEE_WALLET=<your_platform_wallet>
OMNICLAW_SOLANA_RUNTIME_FEE_WALLET=<your_runtime_wallet>
OMNICLAW_SOLANA_COMMITMENT=confirmed
```
