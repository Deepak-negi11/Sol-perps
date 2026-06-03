use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, ORDER_SEED, POSITION_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::event::{PositionClosed, PositionOpened, TriggerOrderExecuted};
use crate::math::{calculate_pnl, calculate_realized_loss, calculate_trading_fee};
use crate::state::{
    Market, OrderType, Position, PositionSide, TriggerCondition, TriggerOrder, UserCollateral,
};

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct ExecuteTriggerOrder<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: Manual owner validation done in oracle module
    pub price_update: UncheckedAccount<'info>,

    /// CHECK: This account identifies the order owner for PDA seeds.
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            USER_COLLATERAL_SEED,
            market.key().as_ref(),
            owner.key().as_ref()
        ],
        bump = user_collateral.bump,
        constraint = user_collateral.owner == owner.key(),
        constraint = user_collateral.market == market.key(),
        constraint = user_collateral.collateral_mint == market.collateral_mint
    )]
    pub user_collateral: Account<'info, UserCollateral>,

    #[account(
        init_if_needed,
        payer = executor,
        space = 8 + Position::INIT_SPACE,
        seeds = [
            POSITION_SEED,
            market.key().as_ref(),
            owner.key().as_ref()
        ],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [
            ORDER_SEED,
            market.key().as_ref(),
            owner.key().as_ref(),
            &order_id.to_le_bytes()
        ],
        bump = order.bump,
        constraint = order.owner == owner.key(),
        constraint = order.market == market.key(),
        constraint = order.order_id == order_id,
        close = executor
    )]
    pub order: Account<'info, TriggerOrder>,

    #[account(mut)]
    pub executor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn execute_trigger_order_handler(
    mut ctx: Context<ExecuteTriggerOrder>,
    order_id: u64,
) -> Result<()> {
    require!(!ctx.accounts.market.is_paused, SolPerpError::MarketPaused);
    require!(ctx.accounts.order.is_active, SolPerpError::OrderNotActive);

    let current_price = crate::oracle::get_price_from_pyth(
        &ctx.accounts.price_update,
        &ctx.accounts.market.price_feed_id,
    )?;
    require!(current_price > 0, SolPerpError::InvalidPrice);
    require!(
        trigger_met(
            current_price,
            ctx.accounts.order.trigger_price,
            ctx.accounts.order.trigger_condition,
        ),
        SolPerpError::TriggerConditionNotMet
    );

    match ctx.accounts.order.order_type {
        OrderType::Limit => execute_limit_order(&mut ctx, current_price)?,
        OrderType::TakeProfit | OrderType::StopLoss => execute_close_order(&mut ctx, current_price)?,
    }

    emit!(TriggerOrderExecuted {
        user: ctx.accounts.owner.key(),
        market: ctx.accounts.market.key(),
        order_id,
        order_type: ctx.accounts.order.order_type,
        executor: ctx.accounts.executor.key(),
        execution_price: current_price,
    });

    ctx.accounts.order.is_active = false;

    Ok(())
}

fn trigger_met(price: u64, trigger_price: u64, condition: TriggerCondition) -> bool {
    match condition {
        TriggerCondition::Above => price >= trigger_price,
        TriggerCondition::Below => price <= trigger_price,
    }
}

fn execute_limit_order(ctx: &mut Context<ExecuteTriggerOrder>, entry_price: u64) -> Result<()> {
    require!(
        !ctx.accounts.position.is_open,
        SolPerpError::PositionAlreadyOpen
    );
    require!(
        ctx.accounts.user_collateral.locked_amount >= ctx.accounts.order.collateral,
        SolPerpError::InsufficientAvailableCollateral
    );

    let trading_fee = calculate_trading_fee(
        ctx.accounts.order.collateral,
        ctx.accounts.market.trading_fees_bps,
    )?;
    let position_collateral = ctx
        .accounts
        .order
        .collateral
        .checked_sub(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;
    require!(
        position_collateral > 0,
        SolPerpError::InvalidPositionCollateral
    );

    let position_size = position_collateral
        .checked_mul(ctx.accounts.order.leverage)
        .ok_or(SolPerpError::MathOverflow)?;

    ctx.accounts.user_collateral.locked_amount = ctx
        .accounts
        .user_collateral
        .locked_amount
        .checked_sub(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;

    ctx.accounts.user_collateral.deposited_amount = ctx
        .accounts
        .user_collateral
        .deposited_amount
        .checked_sub(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;

    ctx.accounts.market.total_trading_fees_collected = ctx
        .accounts
        .market
        .total_trading_fees_collected
        .checked_add(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;

    update_open_interest(
        &mut ctx.accounts.market,
        ctx.accounts.order.side,
        position_size,
        true,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.owner.key();
    position.market = ctx.accounts.market.key();
    position.side = ctx.accounts.order.side;
    position.collateral = position_collateral;
    position.leverage = ctx.accounts.order.leverage;
    position.position_size = position_size;
    position.entry_price = entry_price;
    position.opened_at = now;
    position.is_open = true;
    position.bump = ctx.bumps.position;

    emit!(PositionOpened {
        user: ctx.accounts.owner.key(),
        market: ctx.accounts.market.key(),
        side: position.side,
        collateral: position.collateral,
        leverage: position.leverage,
        position_size: position.position_size,
        entry_price,
    });

    Ok(())
}

fn execute_close_order(ctx: &mut Context<ExecuteTriggerOrder>, exit_price: u64) -> Result<()> {
    require!(ctx.accounts.position.is_open, SolPerpError::PositionNotOpen);
    require!(
        ctx.accounts.position.owner == ctx.accounts.owner.key(),
        SolPerpError::PositionNotOpen
    );
    require!(
        ctx.accounts.position.market == ctx.accounts.market.key(),
        SolPerpError::PositionNotOpen
    );

    let pnl = calculate_pnl(
        &ctx.accounts.position.side,
        ctx.accounts.position.position_size,
        ctx.accounts.position.entry_price,
        exit_price,
    )?;

    if pnl >= 0 {
        let profit = pnl as u64;
        require!(
            ctx.accounts.market.pool_balance >= profit,
            SolPerpError::InsufficientPoolBalance
        );
        ctx.accounts.market.pool_balance = ctx
            .accounts
            .market
            .pool_balance
            .checked_sub(profit)
            .ok_or(SolPerpError::MathOverflow)?;
        ctx.accounts.user_collateral.deposited_amount = ctx
            .accounts
            .user_collateral
            .deposited_amount
            .checked_add(profit)
            .ok_or(SolPerpError::MathOverflow)?;
    } else {
        let loss = pnl.checked_abs().ok_or(SolPerpError::MathOverflow)? as u64;
        let realized_loss = calculate_realized_loss(loss, ctx.accounts.position.collateral);
        ctx.accounts.user_collateral.deposited_amount = ctx
            .accounts
            .user_collateral
            .deposited_amount
            .checked_sub(realized_loss)
            .ok_or(SolPerpError::MathOverflow)?;
        ctx.accounts.market.pool_balance = ctx
            .accounts
            .market
            .pool_balance
            .checked_add(realized_loss)
            .ok_or(SolPerpError::MathOverflow)?;
    }

    ctx.accounts.user_collateral.locked_amount = ctx
        .accounts
        .user_collateral
        .locked_amount
        .checked_sub(ctx.accounts.position.collateral)
        .ok_or(SolPerpError::MathOverflow)?;

    update_open_interest(
        &mut ctx.accounts.market,
        ctx.accounts.position.side,
        ctx.accounts.position.position_size,
        false,
    )?;

    emit!(PositionClosed {
        user: ctx.accounts.owner.key(),
        market: ctx.accounts.market.key(),
        side: ctx.accounts.position.side,
        exit_price,
        pnl,
        deposited_amount_after: ctx.accounts.user_collateral.deposited_amount,
    });

    ctx.accounts.position.is_open = false;

    Ok(())
}

fn update_open_interest(
    market: &mut Market,
    side: PositionSide,
    amount: u64,
    increase: bool,
) -> Result<()> {
    let interest = match side {
        PositionSide::Long => &mut market.open_interest_long,
        PositionSide::Short => &mut market.open_interest_short,
    };

    *interest = if increase {
        interest
            .checked_add(amount)
            .ok_or(SolPerpError::MathOverflow)?
    } else {
        interest
            .checked_sub(amount)
            .ok_or(SolPerpError::MathOverflow)?
    };

    Ok(())
}
