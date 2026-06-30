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

    /// CHECK: Evaluator authority
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
