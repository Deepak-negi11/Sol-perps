use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, POSITION_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::state::{Market, Position, PositionSide, UserCollateral};

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

        let realized_loss = if loss > position.collateral {
            position.collateral
        } else {
            loss
        };

        user_collateral.deposited_amount = user_collateral
            .deposited_amount
            .checked_sub(realized_loss)
            .ok_or(SolPerpError::MathOverflow)?;
    }

    user_collateral.locked_amount = user_collateral
        .locked_amount
        .checked_sub(position.collateral)
        .ok_or(SolPerpError::MathOverflow)?;

    position.is_open = false;

    Ok(())
}

fn calculate_pnl(
    side: &PositionSide,
    position_size: u64,
    entry_price: u64,
    exit_price: u64,
) -> Result<i64> {
    require!(entry_price > 0, SolPerpError::InvalidPrice);
    require!(exit_price > 0, SolPerpError::InvalidPrice);

    let price_diff: i128 = match side {
        PositionSide::Long => exit_price as i128 - entry_price as i128,
        PositionSide::Short => entry_price as i128 - exit_price as i128,
    };

    let pnl = (position_size as i128)
        .checked_mul(price_diff)
        .ok_or(SolPerpError::MathOverflow)?
        .checked_div(entry_price as i128)
        .ok_or(SolPerpError::MathOverflow)?;

    Ok(pnl as i64)
}