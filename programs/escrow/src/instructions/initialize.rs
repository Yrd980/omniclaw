use anchor_lang::prelude::*;
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
