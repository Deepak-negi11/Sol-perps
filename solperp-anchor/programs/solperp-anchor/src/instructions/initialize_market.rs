use crate::constants::{MARKET_SEED, MAX_LEVERAGE_CAP};
use crate::error::SolPerpError;
use crate::event::MarketInitialized;
use crate::state::Market;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

#[derive(Accounts)]
#[instruction(
    max_leverage: u64,
    liquidation_threshold_bps: u64,
    trading_fees_bps: u64,
    price_feed_id: [u8; 32],
    quote_feed_id: [u8; 32]
)]
pub struct InitializeMarket<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, price_feed_id.as_ref(), quote_feed_id.as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_market_handler(
    ctx: Context<InitializeMarket>,
    max_leverage: u64,
    liquidation_threshold_bps: u64,
    trading_fees_bps: u64,
    price_feed_id: [u8; 32],
    quote_feed_id: [u8; 32],
) -> Result<()> {
    require!(
        max_leverage > 0 && max_leverage <= MAX_LEVERAGE_CAP,
        SolPerpError::InvalidMaxLeverage
    );

    let market = &mut ctx.accounts.market;
    market.admin = ctx.accounts.admin.key();
    market.max_leverage = max_leverage;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.price_feed_id = price_feed_id;
    market.quote_feed_id = quote_feed_id;
    market.liquidation_threshold_bps = liquidation_threshold_bps;
    market.trading_fees_bps = trading_fees_bps;
    market.bump = ctx.bumps.market;
    market.is_paused = false;
    market.pool_balance = 0;
    market.open_interest_long = 0;
    market.open_interest_short = 0;
    market.next_order_id = 0;
    market.total_trading_fees_collected = 0;

    emit!(MarketInitialized {
        admin: market.admin,
        market: market.key(),
        collateral_mint: market.collateral_mint,
        max_leverage: market.max_leverage,
        liquidation_threshold_bps: market.liquidation_threshold_bps,
        trading_fees_bps: market.trading_fees_bps,
    });

    Ok(())
}
