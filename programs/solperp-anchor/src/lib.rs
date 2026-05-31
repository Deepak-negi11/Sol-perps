pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("7oYnX6upn2jhobcxUoarHs7MyyiF7ieZgzMGcjfQhrrD");

#[program]
pub mod solperp_anchor {
    use super::*;


    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        max_leverage: u64,
        liquidation_threshold_bps: u64,
        trading_fees_bps: u64,
    ) -> Result<()> {
        initialize_market::initialize_market_handler(ctx, max_leverage, liquidation_threshold_bps, trading_fees_bps)
    }

    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        amount:u64
    ) -> Result<()>{
        deposit_collateral::deposit_collateral_handler(ctx, amount)
    }
}
