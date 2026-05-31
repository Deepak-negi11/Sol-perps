use anchor_lang::prelude::*;

#[error_code]
pub enum SolPerpError {
    #[msg("Invalid max leverage")]
    InvalidMaxLeverage,
    #[msg("Invalid liquidation threshold")]
    InvalidLiquidationThreshold,
    #[msg("Invalid trading fees")]
    InvalidTradingFees,
    #[msg(Deposit amount must be greater than zero)]
    InvalidDepositAmount
}