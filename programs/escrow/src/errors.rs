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
