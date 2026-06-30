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
