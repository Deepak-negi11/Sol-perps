use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        self,Mint,TokenAccount, TokenInterface , TransferChecked,
    },
}

use crate::constants::{USER_COLLATERAL_SEED , VAULT_SEED};
use crate::constants::SolperpError;
use crate::state::UserCollateral;


#[derive(Accounts)]
pub struct DepositCollateral<'info>{
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserCollateral::INIT_SPACE,
        seeds = [USER_COLLATERAL_SEED , user.key().as_ref()],
        bump
    )]
    pub user_collateral: Account<info , UserCollateral>,

    #[account(mut)]
    pub user :Signer<'info>

    pub collateral_mint:InterfaceAccount<'info , Mint>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = user,,
        associated_token::token_program = token_program
    )]
    pub user_collateral_token: InterfaceAccount<'info , TokenAccount>,

    #[account(
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault_authority :UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = collateral_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program
    )]
    pub vault_collateral_token :InterfaceAccount<'info , TokenAccount>,

    pub token_program : InterfaceToken<info , TokenInterface>
    pub associated_token_program : InterfaceAccount<'info , AssociatedToken>,
    
    pub system_program : Program<'info , System>
}

pub fn deposit_collateral_handler(
    ctx: Context<DepositCollateral>,
    amount:u64
) -> Result<()>{
    require!(amount > 0 , SolperpError::InvalidDepositAmount);
    let decimal = ctx.accounts.collateral_mint.decimals;
     
    let cpi_accounts = TransferChecked{
        from :ctx.accounts.user_collateral_token.to_account_info(),
        to : ctx.accounts.vault_collateral_token.to_account_info(),
        mint : ctx.accounts.collateral_mint.to_account_info(),
        authority : ctx.accounts.user.to_account_info()
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );
    token_interface::transfer_checked(cpi_ctx , amount , decimals )?;
    
    let user_collateral = &mut ctx.accounts.user_collateral;
    
    if user_collateral.owner == Pubkey::default(){
        user_collateral.owner = ctx.accounts.user.key();
        user_collateral.deposited_amount = amount;
        user_collateral.locked_amount = 0;
        user_collateral.bump = ctx.bumps.user_collateral;

    }

    user_collateral.deposited_amount = user_collateral
        .deposited_amount
        .checked_add(amount)
        .ok_or(SolperpError::MathOverflow)

    Ok(())
}