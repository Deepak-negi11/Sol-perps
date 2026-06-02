use anchor_lang::prelude::*;

use crate::state::PositionSide;

#[event]
pub struct MarketInitialized {
    pub admin: Pubkey,
    pub market: Pubkey,
    pub collateral_mint: Pubkey,
    pub max_leverage: u64,
    pub liquidation_threshold_bps: u64,
    pub trading_fees_bps: u64,
}

#[event]
pub struct CollateralDeposited {
    pub user: Pubkey,
    pub market: Pubkey,
    pub collateral_mint: Pubkey,
    pub amount: u64,
    pub new_deposited_amount: u64,
}

#[event]
pub struct CollateralWithdrawn {
    pub user: Pubkey,
    pub market: Pubkey,
    pub collateral_mint: Pubkey,
    pub amount: u64,
    pub new_deposited_amount: u64,
}

#[event]
pub struct PositionOpened {
    pub user: Pubkey,
    pub market: Pubkey,
    pub side: PositionSide,
    pub collateral: u64,
    pub leverage: u64,
    pub position_size: u64,
    pub entry_price: u64,
}

#[event]
pub struct PositionClosed {
    pub user: Pubkey,
    pub market: Pubkey,
    pub side: PositionSide,
    pub exit_price: u64,
    pub pnl: i64,
    pub deposited_amount_after: u64,
}

#[event]
pub struct PositionLiquidated {
    pub user: Pubkey,
    pub liquidator: Pubkey,
    pub market: Pubkey,
    pub side: PositionSide,
    pub current_price: u64,
    pub remaining_collateral: u64,
    pub realized_loss: u64,
}