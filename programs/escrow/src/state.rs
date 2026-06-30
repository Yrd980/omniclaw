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
