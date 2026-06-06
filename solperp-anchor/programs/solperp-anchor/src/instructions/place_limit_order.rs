use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, ORDER_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::event::TriggerOrderPlaced;
use crate::math::{calculate_required_margin, calculate_trading_fee};
use crate::state::{Market, OrderType, PositionSide, TriggerCondition, TriggerOrder, UserCollateral};

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct PlaceLimitOrder<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_feed_id.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [
            USER_COLLATERAL_SEED,
            user.key().as_ref()
        ],
        bump = user_collateral.bump,
        constraint = user_collateral.owner == user.key(),
        constraint = user_collateral.collateral_mint == market.collateral_mint
    )]
    pub user_collateral: Account<'info, UserCollateral>,

    #[account(
        init,
        payer = user,
        space = 8 + TriggerOrder::INIT_SPACE,
        seeds = [
            ORDER_SEED,
            market.key().as_ref(),
            user.key().as_ref(),
            &order_id.to_le_bytes()
        ],
        bump
    )]
    pub order: Account<'info, TriggerOrder>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn place_limit_order_handler(
    ctx: Context<PlaceLimitOrder>,
    order_id: u64,
    side: PositionSide,
    collateral: u64,
    leverage: u64,
    trigger_price: u64,
    trigger_condition: TriggerCondition,
) -> Result<()> {
    require!(!ctx.accounts.market.is_paused, SolPerpError::MarketPaused);
    require!(
        order_id == ctx.accounts.market.next_order_id,
        SolPerpError::InvalidOrderId
    );
    require!(collateral > 0, SolPerpError::InvalidPositionCollateral);
    require!(leverage > 0, SolPerpError::InvalidLeverage);
    require!(
        leverage <= ctx.accounts.market.max_leverage,
        SolPerpError::InvalidLeverage
    );
    require!(trigger_price > 0, SolPerpError::InvalidTriggerPrice);

    let user_collateral = &mut ctx.accounts.user_collateral;
    let available_collateral = user_collateral
        .deposited_amount
        .checked_sub(user_collateral.locked_amount)
        .ok_or(SolPerpError::InsufficientAvailableCollateral)?;

    require!(
        available_collateral >= collateral,
        SolPerpError::InsufficientAvailableCollateral
    );

    let trading_fee = calculate_trading_fee(collateral, ctx.accounts.market.trading_fees_bps)?;
    let position_collateral = collateral
        .checked_sub(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;
    let position_size = position_collateral
        .checked_mul(leverage)
        .ok_or(SolPerpError::MathOverflow)?;
    let required_margin =
        calculate_required_margin(position_size, ctx.accounts.market.liquidation_threshold_bps)?;
    require!(
        position_collateral > required_margin,
        SolPerpError::InvalidLeverage
    );

    user_collateral.locked_amount = user_collateral
        .locked_amount
        .checked_add(collateral)
        .ok_or(SolPerpError::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    let market_key = ctx.accounts.market.key();
    let order = &mut ctx.accounts.order;
    order.owner = ctx.accounts.user.key();
    order.market = market_key;
    order.order_id = order_id;
    order.position_id = order_id;
    order.order_type = OrderType::Limit;
    order.side = side;
    order.trigger_condition = trigger_condition;
    order.collateral = collateral;
    order.leverage = leverage;
    order.trigger_price = trigger_price;
    order.created_at = now;
    order.is_active = true;
    order.bump = ctx.bumps.order;

    ctx.accounts.market.next_order_id = ctx
        .accounts
        .market
        .next_order_id
        .checked_add(1)
        .ok_or(SolPerpError::MathOverflow)?;

    emit!(TriggerOrderPlaced {
        user: ctx.accounts.user.key(),
        market: market_key,
        order_id,
        order_type: OrderType::Limit,
        side,
        trigger_condition,
        collateral,
        leverage,
        trigger_price,
    });

    Ok(())
}
