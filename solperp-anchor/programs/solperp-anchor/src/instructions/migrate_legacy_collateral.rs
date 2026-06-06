use anchor_lang::prelude::*;

use crate::constants::USER_COLLATERAL_SEED;
use crate::error::SolPerpError;
use crate::state::UserCollateral;

#[derive(Accounts)]
pub struct MigrateLegacyCollateral<'info> {
    /// CHECK: Used only to derive and verify the old market-specific PDA.
    pub legacy_market: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            USER_COLLATERAL_SEED,
            legacy_market.key().as_ref(),
            user.key().as_ref()
        ],
        bump = legacy_user_collateral.bump,
        constraint = legacy_user_collateral.owner == user.key(),
        constraint = legacy_user_collateral.market == legacy_market.key()
    )]
    pub legacy_user_collateral: Account<'info, UserCollateral>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserCollateral::INIT_SPACE,
        seeds = [USER_COLLATERAL_SEED, user.key().as_ref()],
        bump
    )]
    pub user_collateral: Account<'info, UserCollateral>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn migrate_legacy_collateral_handler(ctx: Context<MigrateLegacyCollateral>) -> Result<()> {
    let legacy = &mut ctx.accounts.legacy_user_collateral;
    let available = legacy
        .deposited_amount
        .checked_sub(legacy.locked_amount)
        .ok_or(SolPerpError::InsufficientAvailableCollateral)?;
    require!(available > 0, SolPerpError::InsufficientAvailableCollateral);

    let shared = &mut ctx.accounts.user_collateral;
    if shared.owner == Pubkey::default() {
        shared.owner = ctx.accounts.user.key();
        shared.market = Pubkey::default();
        shared.collateral_mint = legacy.collateral_mint;
        shared.bump = ctx.bumps.user_collateral;
    }
    require!(
        shared.collateral_mint == legacy.collateral_mint,
        SolPerpError::InvalidCollateralMint
    );

    legacy.deposited_amount = legacy.locked_amount;
    shared.deposited_amount = shared
        .deposited_amount
        .checked_add(available)
        .ok_or(SolPerpError::MathOverflow)?;

    Ok(())
}
