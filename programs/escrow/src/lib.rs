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
