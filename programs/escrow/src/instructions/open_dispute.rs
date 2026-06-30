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
