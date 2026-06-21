use anchor_lang::prelude::*;

use crate::constants::{MARKET_SEED, MAX_LEVERAGE_CAP};
use crate::error::SolPerpError;
use crate::state::Market;

#[derive(Accounts)]
pub struct UpdateMarketConfig<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_feed_id.as_ref(), market.quote_feed_id.as_ref()],
        bump = market.bump,
        constraint = market.admin == admin.key() @ SolPerpError::UnauthorizedAdmin
    )]
    pub market: Account<'info, Market>,

    pub admin: Signer<'info>,
}

pub fn update_market_config_handler(
    ctx: Context<UpdateMarketConfig>,
    max_leverage: u64,
    liquidation_threshold_bps: u64,
    trading_fees_bps: u64,
) -> Result<()> {
    require!(
        max_leverage > 0 && max_leverage <= MAX_LEVERAGE_CAP,
        SolPerpError::InvalidMaxLeverage
    );

    require!(
        liquidation_threshold_bps > 0 && liquidation_threshold_bps < 10_000,
        SolPerpError::InvalidLiquidationThreshold
    );

    require!(trading_fees_bps < 100, SolPerpError::InvalidTradingFees);

    let market = &mut ctx.accounts.market;

    market.max_leverage = max_leverage;
    market.liquidation_threshold_bps = liquidation_threshold_bps;
    market.trading_fees_bps = trading_fees_bps;

    Ok(())
}
