use anchor_lang::prelude::*;


use crate::constants::{MARKET_SEED, POSITION_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::state::{Market, Position, PositionSide, UserCollateral};

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
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
            position.owner.as_ref()
        ],
        bump = user_collateral.bump,
        constraint = user_collateral.owner == position.owner,
        constraint = user_collateral.market == market.key(),
        constraint = user_collateral.collateral_mint == market.collateral_mint
    )]
    pub user_collateral: Account<'info, UserCollateral>,

    #[account(
        mut,
        seeds = [
            POSITION_SEED,
            market.key().as_ref(),
            position.owner.as_ref()
        ],
        bump = position.bump,
        constraint = position.market == market.key()
    )]
    pub position: Account<'info, Position>,

    /// CHECK: Manual owner validation done in oracle module
    pub price_update: UncheckedAccount<'info>,



    #[account(mut)]
    pub liquidator: Signer<'info>,
}

pub fn liquidate_position_handler(
    ctx: Context<LiquidatePosition>,
) -> Result<()> {
    // Read current price from Pyth oracle
    let current_price = crate::oracle::get_price_from_pyth(
            &ctx.accounts.price_update,
            &ctx.accounts.market.price_feed_id,
    )?;    
    
    require!(current_price > 0, SolPerpError::InvalidPrice);

    let market = &ctx.accounts.market;
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

    let required_margin = position
        .position_size
        .checked_mul(market.liquidation_threshold_bps)
        .ok_or(SolPerpError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(SolPerpError::MathOverflow)?;

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

    position.is_open = false;

    Ok(())
}

fn calculate_pnl(
    side: &PositionSide,
    position_size: u64,
    entry_price: u64,
    current_price: u64,
) -> Result<i64> {
    require!(entry_price > 0, SolPerpError::InvalidPrice);
    require!(current_price > 0, SolPerpError::InvalidPrice);

    let price_diff: i128 = match side {
        PositionSide::Long => current_price as i128 - entry_price as i128,
        PositionSide::Short => entry_price as i128 - current_price as i128,
    };

    let pnl = (position_size as i128)
        .checked_mul(price_diff)
        .ok_or(SolPerpError::MathOverflow)?
        .checked_div(entry_price as i128)
        .ok_or(SolPerpError::MathOverflow)?;

    Ok(pnl as i64)
}

fn calculate_remaining_collateral(
    position_collateral: u64,
    pnl: i64,
) -> Result<u64> {
    if pnl >= 0 {
        let profit = pnl as u64;

        position_collateral
            .checked_add(profit)
            .ok_or(SolPerpError::MathOverflow.into())
    } else {
        let loss = pnl
            .checked_abs()
            .ok_or(SolPerpError::MathOverflow)? as u64;

        if loss >= position_collateral {
            Ok(0)
        } else {
            position_collateral
                .checked_sub(loss)
                .ok_or(SolPerpError::MathOverflow.into())
        }
    }
}