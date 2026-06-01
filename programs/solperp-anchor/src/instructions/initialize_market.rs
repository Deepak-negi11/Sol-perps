use anchor_lang::prelude::*;
use crate::state::Market;
use crate::constants::MARKET_SEED;
use anchor_spl::token_interface::Mint;

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 8 + 32 + 8 + 8 + 1, // discriminator (8) + admin (32) + max_leverage (8) + collateral_mint (32) + liquidation_threshold_bps (8) + trading_fees_bps (8) + bump (1)
        seeds = [MARKET_SEED],
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
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.admin = ctx.accounts.admin.key();
    market.max_leverage = max_leverage;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.liquidation_threshold_bps = liquidation_threshold_bps;
    market.trading_fees_bps = trading_fees_bps;
    market.bump = ctx.bumps.market;
    Ok(())
}
