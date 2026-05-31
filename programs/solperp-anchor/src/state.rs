use anchor_lang::prelude::*;

#[account]
pub struct Market {
    pub admin: Pubkey,
    pub max_leverage: u64,
    pub liquidation_threshold_bps: u64,
    pub trading_fees_bps: u64,
    pub bump: u8,
}


#[account]
#[derive(InitSpace)]
pub struct UserCollateral{
    pub owner : Pubkey,
    pub deposited_amount :u64,
    pub locked_amount :u64,
    pub bump : u8
}

