use anchor_lang::prelude::*;

use crate::constants::MARKET_SEED;
use crate::error::SolPerpError;
use crate::state::Market;

#[derive(Accounts)]
pub struct PauseMarket<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_feed_id.as_ref()],
        bump = market.bump,
        constraint = market.admin == admin.key() @ SolPerpError::UnauthorizedAdmin
    )]
    pub market: Account<'info, Market>,

    pub admin: Signer<'info>,
}

pub fn pause_market_handler(ctx: Context<PauseMarket>) -> Result<()> {
    ctx.accounts.market.is_paused = true;
    Ok(())
}
