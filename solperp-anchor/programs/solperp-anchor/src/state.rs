use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub admin: Pubkey,
    pub max_leverage: u64,
    pub price_feed_id: [u8; 32],
    pub collateral_mint: Pubkey,
    pub liquidation_threshold_bps: u64,
    pub trading_fees_bps: u64,
    pub total_trading_fees_collected: u64,
    pub pool_balance: u64,
    pub open_interest_long: u64,
    pub open_interest_short: u64,
    pub next_order_id: u64,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserCollateral {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub collateral_mint: Pubkey,
    pub deposited_amount: u64,
    pub locked_amount: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionSide {
    Long,
    Short,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderType {
    Limit,
    TakeProfit,
    StopLoss,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TriggerCondition {
    Above,
    Below,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub position_id: u64,
    pub side: PositionSide,
    pub collateral: u64,
    pub leverage: u64,
    pub position_size: u64,
    pub entry_price: u64,
    pub opened_at: i64,
    pub is_open: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TriggerOrder {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub order_id: u64,
    pub position_id: u64,
    pub order_type: OrderType,
    pub side: PositionSide,
    pub trigger_condition: TriggerCondition,
    pub collateral: u64,
    pub leverage: u64,
    pub trigger_price: u64,
    pub created_at: i64,
    pub is_active: bool,
    pub bump: u8,
}
