use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, POSITION_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::event::PositionOpened;
use crate::math::{calculate_required_margin, calculate_trading_fee};
use crate::state::{Market, Position, PositionSide, UserCollateral};

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct OpenPosition<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_feed_id.as_ref(), market.quote_feed_id.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: base (SOL) Pyth price; validated in oracle module
    pub price_update: UncheckedAccount<'info>,

    /// CHECK: quote (HYPE) Pyth price; validated in oracle module
    pub quote_price_update: UncheckedAccount<'info>,

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
        init_if_needed,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [
            POSITION_SEED,
            market.key().as_ref(),
            user.key().as_ref(),
            &position_id.to_le_bytes()
        ],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn open_position_handler(
    ctx: Context<OpenPosition>,
    position_id: u64,
    side: PositionSide,
    collateral: u64,
    leverage: u64,
) -> Result<()> {
    require!(!ctx.accounts.market.is_paused, SolPerpError::MarketPaused);
    require!(collateral > 0, SolPerpError::InvalidPositionCollateral);
    require!(leverage > 0, SolPerpError::InvalidLeverage);
    require!(
        leverage <= ctx.accounts.market.max_leverage,
        SolPerpError::InvalidLeverage
    );
    require!(
        !ctx.accounts.position.is_open,
        SolPerpError::PositionAlreadyOpen
    );
    // Read entry price from Pyth oracle
    let entry_price = crate::oracle::get_ratio_price(
        &ctx.accounts.price_update,
        &ctx.accounts.quote_price_update,
        &ctx.accounts.market.price_feed_id,
        &ctx.accounts.market.quote_feed_id,
    )?;
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

    let position_collateral_after_fee = collateral
        .checked_sub(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;

    require!(
        position_collateral_after_fee > 0,
        SolPerpError::InvalidPositionCollateral
    );

    let position_size = position_collateral_after_fee
        .checked_mul(leverage)
        .ok_or(SolPerpError::MathOverflow)?;
    let required_margin =
        calculate_required_margin(position_size, ctx.accounts.market.liquidation_threshold_bps)?;
    require!(
        position_collateral_after_fee > required_margin,
        SolPerpError::InvalidLeverage
    );

    user_collateral.locked_amount = user_collateral
        .locked_amount
        .checked_add(position_collateral_after_fee)
        .ok_or(SolPerpError::MathOverflow)?;

    user_collateral.deposited_amount = user_collateral
        .deposited_amount
        .checked_sub(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;

    ctx.accounts.market.total_trading_fees_collected = ctx
        .accounts
        .market
        .total_trading_fees_collected
        .checked_add(trading_fee)
        .ok_or(SolPerpError::MathOverflow)?;

    match side {
        PositionSide::Long => {
            ctx.accounts.market.open_interest_long = ctx
                .accounts
                .market
                .open_interest_long
                .checked_add(position_size)
                .ok_or(SolPerpError::MathOverflow)?;
        }
        PositionSide::Short => {
            ctx.accounts.market.open_interest_short = ctx
                .accounts
                .market
                .open_interest_short
                .checked_add(position_size)
                .ok_or(SolPerpError::MathOverflow)?;
        }
    }

    let now = Clock::get()?.unix_timestamp;

    let position = &mut ctx.accounts.position;

    position.owner = ctx.accounts.user.key();
    position.market = ctx.accounts.market.key();
    position.position_id = position_id;
    position.side = side;
    position.collateral = position_collateral_after_fee;
    position.leverage = leverage;
    position.position_size = position_size;
    position.entry_price = entry_price;
    position.opened_at = now;
    position.is_open = true;
    position.bump = ctx.bumps.position;

    emit!(PositionOpened {
        user: ctx.accounts.user.key(),
        market: ctx.accounts.market.key(),
        side: position.side.clone(),
        collateral: position.collateral,
        leverage: position.leverage,
        position_size: position.position_size,
        entry_price: position.entry_price,
    });

    Ok(())
}
