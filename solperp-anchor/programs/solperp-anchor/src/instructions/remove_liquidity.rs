use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::constants::{MARKET_SEED, VAULT_SEED};
use crate::error::SolPerpError;
use crate::event::LiquidityRemoved;
use crate::state::Market;

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_feed_id.as_ref()],
        bump = market.bump,
        constraint = market.admin == admin.key() @ SolPerpError::UnauthorizedAdmin,
        constraint = market.collateral_mint == collateral_mint.key()
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [VAULT_SEED],
        bump
    )]
    /// CHECK: This PDA only acts as token authority for the vault token account.
    pub vault_authority: UncheckedAccount<'info>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = collateral_mint,
        associated_token::authority = admin,
        associated_token::token_program = token_program
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn remove_liquidity_handler(ctx: Context<RemoveLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, SolPerpError::InvalidLiquidityAmount);
    require!(
        ctx.accounts.market.pool_balance >= amount,
        SolPerpError::InsufficientPoolBalance
    );

    let vault_seeds: &[&[u8]] = &[VAULT_SEED, &[ctx.bumps.vault_authority]];

    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];
    let decimals = ctx.accounts.collateral_mint.decimals;

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_token_account.to_account_info(),
        mint: ctx.accounts.collateral_mint.to_account_info(),
        to: ctx.accounts.admin_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };

    let cpi_context =
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer_seeds);

    token_interface::transfer_checked(cpi_context, amount, decimals)?;

    ctx.accounts.market.pool_balance = ctx
        .accounts
        .market
        .pool_balance
        .checked_sub(amount)
        .ok_or(SolPerpError::MathOverflow)?;

    emit!(LiquidityRemoved {
        admin: ctx.accounts.admin.key(),
        market: ctx.accounts.market.key(),
        collateral_mint: ctx.accounts.collateral_mint.key(),
        amount,
        new_pool_balance: ctx.accounts.market.pool_balance,
    });

    Ok(())
}
