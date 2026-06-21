use crate::constants::{MARKET_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::event::PositionLiquidated;
use crate::math::{calculate_pnl, calculate_remaining_collateral, calculate_required_margin};
use crate::state::{Market, Position, PositionSide, UserCollateral};
use anchor_lang::prelude::*;
#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_feed_id.as_ref(), market.quote_feed_id.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [
            USER_COLLATERAL_SEED,
            position.owner.as_ref()
        ],
        bump = user_collateral.bump,
        constraint = user_collateral.owner == position.owner,
        constraint = user_collateral.collateral_mint == market.collateral_mint
    )]
    pub user_collateral: Account<'info, UserCollateral>,

    #[account(
        mut,
        constraint = position.market == market.key()
    )]
    pub position: Account<'info, Position>,

    /// CHECK: base (SOL) Pyth price; validated in oracle module
    pub price_update: UncheckedAccount<'info>,

    /// CHECK: quote (HYPE) Pyth price; validated in oracle module
    pub quote_price_update: UncheckedAccount<'info>,

    #[account(mut)]
    pub liquidator: Signer<'info>,
}

pub fn liquidate_position_handler(ctx: Context<LiquidatePosition>) -> Result<()> {
    // Read current price from Pyth oracle
    let current_price = crate::oracle::get_ratio_price(
        &ctx.accounts.price_update,
        &ctx.accounts.quote_price_update,
        &ctx.accounts.market.price_feed_id,
        &ctx.accounts.market.quote_feed_id,
    )?;

    require!(current_price > 0, SolPerpError::InvalidPrice);

    let market = &mut ctx.accounts.market;
    let user_collateral = &mut ctx.accounts.user_collateral;
    let position = &mut ctx.accounts.position;

    require!(position.is_open, SolPerpError::PositionNotOpen);

    let pnl = calculate_pnl(
        &position.side,
        position.position_size,
        position.entry_price,
        current_price,
    )?;

    let remaining_collateral = calculate_remaining_collateral(position.collateral, pnl)?;

    let required_margin =
        calculate_required_margin(position.position_size, market.liquidation_threshold_bps)?;

    require!(
        remaining_collateral <= required_margin,
        SolPerpError::PositionNotLiquidatable
    );

    let realized_loss = position
        .collateral
        .checked_sub(remaining_collateral)
        .ok_or(SolPerpError::MathOverflow)?;

    user_collateral.deposited_amount = user_collateral
        .deposited_amount
        .checked_sub(realized_loss)
        .ok_or(SolPerpError::MathOverflow)?;

    user_collateral.locked_amount = user_collateral
        .locked_amount
        .checked_sub(position.collateral)
        .ok_or(SolPerpError::MathOverflow)?;

    market.pool_balance = market
        .pool_balance
        .checked_add(realized_loss)
        .ok_or(SolPerpError::MathOverflow)?;

    match position.side {
        PositionSide::Long => {
            market.open_interest_long = market
                .open_interest_long
                .checked_sub(position.position_size)
                .ok_or(SolPerpError::MathOverflow)?;
        }
        PositionSide::Short => {
            market.open_interest_short = market
                .open_interest_short
                .checked_sub(position.position_size)
                .ok_or(SolPerpError::MathOverflow)?;
        }
    }

    emit!(PositionLiquidated {
        user: position.owner,
        liquidator: ctx.accounts.liquidator.key(),
        market: market.key(),
        side: position.side.clone(),
        current_price,
        remaining_collateral,
        realized_loss,
    });

    position.is_open = false;

    Ok(())
}
