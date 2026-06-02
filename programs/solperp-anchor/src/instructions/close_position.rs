use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, POSITION_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::state::{Market, Position, UserCollateral};
use crate::math::{calculate_pnl, calculate_realized_loss};
use crate::event::PositionClosed;

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [
            USER_COLLATERAL_SEED,
            market.key().as_ref(),
            user.key().as_ref()
        ],
        bump = user_collateral.bump,
        constraint = user_collateral.owner == user.key(),
        constraint = user_collateral.market == market.key(),
        constraint = user_collateral.collateral_mint == market.collateral_mint
    )]
    pub user_collateral: Account<'info, UserCollateral>,

    #[account(
        mut,
        seeds = [
            POSITION_SEED,
            market.key().as_ref(),
            user.key().as_ref()
        ],
        bump = position.bump,
        constraint = position.owner == user.key(),
        constraint = position.market == market.key()
    )]
    pub position: Account<'info, Position>,

    /// CHECK: Manual owner validation done in oracle module
    pub price_update: UncheckedAccount<'info>,



    #[account(mut)]
    pub user: Signer<'info>,
}

pub fn close_position_handler(
    ctx: Context<ClosePosition>,
) -> Result<()> {
    // Read exit price from Pyth oracle
   let exit_price = crate::oracle::get_price_from_pyth(
        &ctx.accounts.price_update,
        &ctx.accounts.market.price_feed_id,
    )?;
    require!(exit_price > 0, SolPerpError::InvalidPrice);

    let user_collateral = &mut ctx.accounts.user_collateral;
    let position = &mut ctx.accounts.position;

    require!(position.is_open, SolPerpError::PositionNotOpen);

    let pnl = calculate_pnl(
        &position.side,
        position.position_size,
        position.entry_price,
        exit_price,
    )?;

    if pnl >= 0 {
        let profit = pnl as u64;

        user_collateral.deposited_amount = user_collateral
            .deposited_amount
            .checked_add(profit)
            .ok_or(SolPerpError::MathOverflow)?;
    } else {
        let loss = pnl
            .checked_abs()
            .ok_or(SolPerpError::MathOverflow)? as u64;

        let realized_loss = calculate_realized_loss(loss, position.collateral);

        user_collateral.deposited_amount = user_collateral
            .deposited_amount
            .checked_sub(realized_loss)
            .ok_or(SolPerpError::MathOverflow)?;
    }

    user_collateral.locked_amount = user_collateral
        .locked_amount
        .checked_sub(position.collateral)
        .ok_or(SolPerpError::MathOverflow)?;
    let user = position.owner;
    let market = position.market;
    let side = position.side.clone();

    emit!(PositionClosed {
        user,
        market,
        side,
        exit_price,
        pnl,
        deposited_amount_after: user_collateral.deposited_amount,
    });

    position.is_open = false;

    Ok(())
}

