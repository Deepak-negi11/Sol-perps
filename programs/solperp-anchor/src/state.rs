use anchor_lang::prelude::*;

#[account]
pub struct Market {
    pub admin: Pubkey,
    pub max_leverage: u64,
    pub liquidation_threshold_bps: u64,
    pub trading_fees_bps: u64,
    pub bump: u8,
}
