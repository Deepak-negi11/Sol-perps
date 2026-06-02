use anchor_lang::prelude::*;

#[error_code]
pub enum SolPerpError {
    #[msg("Invalid max leverage")]
    InvalidMaxLeverage,
    #[msg("Invalid liquidation threshold")]
    InvalidLiquidationThreshold,
    #[msg("Invalid trading fees")]
    InvalidTradingFees,
    #[msg("Deposit amount must be greater than zero")]
    InvalidDepositAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Withdraw amount must be greater than zero")]
    InvalidWithdrawAmount,
    #[msg("Insufficient available collateral")]
    InsufficientAvailableCollateral,
    #[msg("Invalid position collateral")]
    InvalidPositionCollateral,
    #[msg("Invalid leverage")]
    InvalidLeverage,
    #[msg("Position already open")]
    PositionAlreadyOpen,
    #[msg("Position is not open")]
    PositionNotOpen,
    #[msg("Loss exceeds collateral")]
    LossExceedsCollateral,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Position not liquidatable")]
    PositionNotLiquidatable,
    #[msg("Invalid oracle price")]
    InvalidOraclePrice,
    #[msg("Oracle confidence too wide")]
    OracleConfidenceTooWide,
}