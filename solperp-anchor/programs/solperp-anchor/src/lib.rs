pub mod constants;
pub mod error;
pub mod event;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;

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
        price_feed_id: [u8; 32],
        quote_feed_id: [u8; 32],
    ) -> Result<()> {
        initialize_market::initialize_market_handler(
            ctx,
            max_leverage,
            liquidation_threshold_bps,
            trading_fees_bps,
            price_feed_id,
            quote_feed_id,
        )
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        deposit_collateral::deposit_collateral_handler(ctx, amount)
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        withdraw_collateral::withdraw_collateral_handler(ctx, amount)
    }

    pub fn migrate_legacy_collateral(ctx: Context<MigrateLegacyCollateral>) -> Result<()> {
        migrate_legacy_collateral_handler(ctx)
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        position_id: u64,
        side: PositionSide,
        collateral: u64,
        leverage: u64,
    ) -> Result<()> {
        open_position::open_position_handler(ctx, position_id, side, collateral, leverage)
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        close_position::close_position_handler(ctx)
    }

    pub fn liquidate_position(ctx: Context<LiquidatePosition>) -> Result<()> {
        liquidation_position::liquidate_position_handler(ctx)
    }

    pub fn pause_market(ctx: Context<PauseMarket>) -> Result<()> {
        pause_market::pause_market_handler(ctx)
    }

    pub fn resume_market(ctx: Context<ResumeMarket>) -> Result<()> {
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
    pub fn withdraw_protocol_fees(ctx: Context<WithdrawProtocolFees>, amount: u64) -> Result<()> {
        withdraw_protocol_fees_handler(ctx, amount)
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount: u64) -> Result<()> {
        add_liquidity_handler(ctx, amount)
    }

    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, amount: u64) -> Result<()> {
        remove_liquidity_handler(ctx, amount)
    }

    pub fn place_limit_order(
        ctx: Context<PlaceLimitOrder>,
        order_id: u64,
        side: PositionSide,
        collateral: u64,
        leverage: u64,
        trigger_price: u64,
        trigger_condition: TriggerCondition,
    ) -> Result<()> {
        place_limit_order_handler(
            ctx,
            order_id,
            side,
            collateral,
            leverage,
            trigger_price,
            trigger_condition,
        )
    }

    pub fn place_tp_sl_order(
        ctx: Context<PlaceTpSlOrder>,
        order_id: u64,
        position_id: u64,
        order_type: OrderType,
        trigger_price: u64,
        trigger_condition: TriggerCondition,
    ) -> Result<()> {
        place_tp_sl_order_handler(
            ctx,
            order_id,
            position_id,
            order_type,
            trigger_price,
            trigger_condition,
        )
    }

    pub fn cancel_trigger_order(
        ctx: Context<CancelTriggerOrder>,
        order_id: u64,
    ) -> Result<()> {
        cancel_trigger_order_handler(ctx, order_id)
    }

    pub fn execute_trigger_order(
        ctx: Context<ExecuteTriggerOrder>,
        order_id: u64,
    ) -> Result<()> {
        execute_trigger_order_handler(ctx, order_id)
    }
}
