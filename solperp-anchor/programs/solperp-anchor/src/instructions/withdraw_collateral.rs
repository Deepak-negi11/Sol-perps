use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        self,Mint,TokenAccount,TokenInterface,TransferChecked
    },
};
use crate::constants::{USER_COLLATERAL_SEED , VAULT_SEED};
use crate::error::SolPerpError;
use crate::state::{Market,UserCollateral};


#[derive(Accounts)]
pub struct WithdrawCollateral<'info>{
    #[account(
        mut,
        seeds = [b"market"],
        bump = market.bump,
        constraint = market.collateral_mint == collateral_mint.key()
    )]
    pub market: Account<'info , Market>,

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
    pub user_collateral: Account<'info , UserCollateral>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub collateral_mint: InterfaceAccount<'info , Mint>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = collateral_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_collateral_token_account: InterfaceAccount<'info , TokenAccount>,

    /// CHECK: This is the vault authority PDA
    #[account(
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault_authority:UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info , TokenAccount>,

    pub token_program: Interface<'info , TokenInterface>,
    pub associated_token_program: Program<'info , AssociatedToken>,
    pub system_program:Program<'info , System>
}


pub fn withdraw_collateral_handler(
    ctx:Context<WithdrawCollateral>,
    amount: u64
)-> Result<()>{
    require!(amount > 0 , SolPerpError::InvalidWithdrawAmount);

    let user_collateral = &mut ctx.accounts.user_collateral;

    let available_amount = user_collateral
        .deposited_amount
        .checked_sub(user_collateral.locked_amount)
        .ok_or(SolPerpError::InsufficientAvailableCollateral)?;

    require!(
        available_amount >= amount,
        SolPerpError::InsufficientAvailableCollateral
    );

    let decimals = ctx.accounts.collateral_mint.decimals;

    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        &[ctx.bumps.vault_authority],
    ];

    let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

    let cpi_accounts = TransferChecked{
        from : ctx.accounts.vault_token_account.to_account_info(),
        mint : ctx.accounts.collateral_mint.to_account_info(),
        to: ctx.accounts.user_collateral_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    user_collateral.deposited_amount = user_collateral

        .deposited_amount

        .checked_sub(amount)

        .ok_or(SolPerpError::InsufficientAvailableCollateral)?;

    Ok(())
}