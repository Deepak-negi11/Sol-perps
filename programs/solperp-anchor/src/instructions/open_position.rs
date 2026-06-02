use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, POSITION_SEED, USER_COLLATERAL_SEED};
use crate::error::SolPerpError;
use crate::state::{Market, Position, PositionSide, UserCollateral};

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: Manual owner validation done in oracle module
    pub price_update: UncheckedAccount<'info>,

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
        init_if_needed,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [
            POSITION_SEED,
            market.key().as_ref(),
            user.key().as_ref()
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
    side: PositionSide,
    collateral: u64,
    leverage: u64,
) -> Result<()> {
    require!(collateral > 0, SolPerpError::InvalidPositionCollateral);
    require!(leverage > 0, SolPerpError::InvalidLeverage);
    require!(
        leverage <= ctx.accounts.market.max_leverage,
        SolPerpError::InvalidLeverage
    );
    require!(!ctx.accounts.position.is_open, SolPerpError::PositionAlreadyOpen);

    // Read entry price from Pyth oracle
    let entry_price = crate::oracle::get_price_from_pyth(
        &ctx.accounts.price_update,
        &ctx.accounts.market.price_feed_id,
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

    let position_size = collateral
        .checked_mul(leverage)
        .ok_or(SolPerpError::MathOverflow)?;

    user_collateral.locked_amount = user_collateral
        .locked_amount
        .checked_add(collateral)
        .ok_or(SolPerpError::MathOverflow)?;

    let position = &mut ctx.accounts.position;

    position.owner = ctx.accounts.user.key();
    position.market = ctx.accounts.market.key();
    position.side = side;
    position.collateral = collateral;
    position.leverage = leverage;
    position.position_size = position_size;
    position.entry_price = entry_price;
    position.is_open = true;
    position.bump = ctx.bumps.position;

    Ok(())
}