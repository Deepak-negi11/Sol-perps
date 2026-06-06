// use to cancel the any active order
use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, ORDER_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::event::TriggerOrderCanceled;
use crate::state::{Market, OrderType, TriggerOrder, UserCollateral};

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct CancelTriggerOrder<'info> {
    #[account(
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
        mut,
        seeds = [
            ORDER_SEED,
            market.key().as_ref(),
            user.key().as_ref(),
            &order_id.to_le_bytes()
        ],
        bump = order.bump,
        constraint = order.owner == user.key(),
        constraint = order.market == market.key(),
        constraint = order.order_id == order_id,
        close = user
    )]
    pub order: Account<'info, TriggerOrder>,

    #[account(mut)]
    pub user: Signer<'info>,
}

pub fn cancel_trigger_order_handler(
    ctx: Context<CancelTriggerOrder>,
    order_id: u64,
) -> Result<()> {
    require!(ctx.accounts.order.is_active, SolPerpError::OrderNotActive);

    if ctx.accounts.order.order_type == OrderType::Limit {
        ctx.accounts.user_collateral.locked_amount = ctx
            .accounts
            .user_collateral
            .locked_amount
            .checked_sub(ctx.accounts.order.collateral)
            .ok_or(SolPerpError::MathOverflow)?;
    }

    emit!(TriggerOrderCanceled {
        user: ctx.accounts.user.key(),
        market: ctx.accounts.market.key(),
        order_id,
        order_type: ctx.accounts.order.order_type,
    });

    Ok(())
}
