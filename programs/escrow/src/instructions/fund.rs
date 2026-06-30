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
