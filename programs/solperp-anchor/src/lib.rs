pub mod constants;
pub mod error;
pub mod instructions;
pub mod oracle;
pub mod state;
pub mod math;
pub mod event;


use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("7oYnX6upn2jhobcxUoarHs7MyyiF7ieZgzMGcjfQhrrD");

#[program]
pub mod solperp_anchor {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        max_leverage: u64,
        liquidation_threshold_bps: u64,
        trading_fees_bps: u64,
        price_feed_id: [u8;32]
    ) -> Result<()> {
        initialize_market::initialize_market_handler(
            ctx,
            max_leverage,
            liquidation_threshold_bps,
            trading_fees_bps,
            price_feed_id,
        )
    }

    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        amount: u64,
    ) -> Result<()> {
        deposit_collateral::deposit_collateral_handler(ctx, amount)
    }

    pub fn withdraw_collateral(
        ctx: Context<WithdrawCollateral>,
        amount: u64,
    ) -> Result<()> {
        withdraw_collateral::withdraw_collateral_handler(ctx, amount)
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        side: PositionSide,
        collateral: u64,
        leverage: u64,
    ) -> Result<()> {
        open_position::open_position_handler(ctx, side, collateral, leverage)
    }

    pub fn close_position(
        ctx: Context<ClosePosition>,
    ) -> Result<()> {
        close_position::close_position_handler(ctx)
    }

    pub fn liquidate_position(
        ctx: Context<LiquidatePosition>,
    ) -> Result<()> {
        liquidation_position::liquidate_position_handler(ctx)
    }

    pub fn pause_market(
        ctx: Context<PauseMarket>,
    ) -> Result<()> {
        pause_market::pause_market_handler(ctx)
    }

    pub fn resume_market(
        ctx: Context<ResumeMarket>,
    ) -> Result<()> {
        resume_market::resume_market_handler(ctx)
    }

    pub fn update_market_config(
        ctx: Context<UpdateMarketConfig>,
        max_leverage: u64,
        liquidation_threshold_bps: u64,
        trading_fees_bps: u64,
    ) -> Result<()> {
        update_market_config_handler(
            ctx,
            max_leverage,
            liquidation_threshold_bps,
            trading_fees_bps,
        )
    }

}
