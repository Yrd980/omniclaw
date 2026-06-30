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
