use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, ORDER_SEED};
use crate::error::SolPerpError;
use crate::event::TriggerOrderPlaced;
use crate::state::{Market, OrderType, Position, TriggerCondition, TriggerOrder};

#[derive(Accounts)]
#[instruction(order_id: u64, position_id: u64)]
pub struct PlaceTpSlOrder<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_feed_id.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        constraint = position.owner == user.key(),
        constraint = position.market == market.key()
    )]
    pub position: Account<'info, Position>,

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

pub fn place_tp_sl_order_handler(
    ctx: Context<PlaceTpSlOrder>,
    order_id: u64,
    position_id: u64,
    order_type: OrderType,
    trigger_price: u64,
    trigger_condition: TriggerCondition,
) -> Result<()> {
    require!(!ctx.accounts.market.is_paused, SolPerpError::MarketPaused);
    require!(
        order_id == ctx.accounts.market.next_order_id,
        SolPerpError::InvalidOrderId
    );
    require!(
        order_type == OrderType::TakeProfit || order_type == OrderType::StopLoss,
        SolPerpError::InvalidOrderType
    );
    require!(ctx.accounts.position.is_open, SolPerpError::PositionNotOpen);
    require!(
        ctx.accounts.position.position_id == position_id,
        SolPerpError::PositionNotOpen
    );
    require!(trigger_price > 0, SolPerpError::InvalidTriggerPrice);

    let now = Clock::get()?.unix_timestamp;
    let market_key = ctx.accounts.market.key();
    let order = &mut ctx.accounts.order;
    order.owner = ctx.accounts.user.key();
    order.market = market_key;
    order.order_id = order_id;
    order.position_id = position_id;
    order.order_type = order_type;
    order.side = ctx.accounts.position.side;
    order.trigger_condition = trigger_condition;
    order.collateral = 0;
    order.leverage = 0;
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
        order_type,
        side: ctx.accounts.position.side,
        trigger_condition,
        collateral: 0,
        leverage: 0,
        trigger_price,
    });

    Ok(())
}
