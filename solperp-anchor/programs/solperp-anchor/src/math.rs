use anchor_lang::prelude::*;

use crate::error::SolPerpError;
use crate::state::PositionSide;

pub fn calculate_pnl(
    side: &PositionSide,
    position_size: u64,
    entry_price: u64,
    current_price: u64,
) -> Result<i64> {
    require!(entry_price > 0, SolPerpError::InvalidPrice);
    require!(current_price > 0, SolPerpError::InvalidPrice);

    let price_diff: i128 = match side {
        PositionSide::Long => current_price as i128 - entry_price as i128,
        PositionSide::Short => entry_price as i128 - current_price as i128,
    };

    let pnl = (position_size as i128)
        .checked_mul(price_diff)
        .ok_or(SolPerpError::MathOverflow)?
        .checked_div(entry_price as i128)
        .ok_or(SolPerpError::MathOverflow)?;

    require!(
        pnl >= i64::MIN as i128 && pnl <= i64::MAX as i128,
        SolPerpError::MathOverflow
    );

    Ok(pnl as i64)
}

pub fn calculate_remaining_collateral(position_collateral: u64, pnl: i64) -> Result<u64> {
    if pnl >= 0 {
        let profit = pnl as u64;

        position_collateral
            .checked_add(profit)
            .ok_or(SolPerpError::MathOverflow.into())
    } else {
        let loss = pnl.checked_abs().ok_or(SolPerpError::MathOverflow)? as u64;

        if loss >= position_collateral {
            Ok(0)
        } else {
            position_collateral
                .checked_sub(loss)
                .ok_or(SolPerpError::MathOverflow.into())
        }
    }
}

pub fn calculate_realized_loss(loss: u64, position_collateral: u64) -> u64 {
    if loss > position_collateral {
        position_collateral
    } else {
        loss
    }
}

// minimum collateral needed to keep the position safe
pub fn calculate_required_margin(
    position_size: u64,
    liquidation_threshold_bps: u64,
) -> Result<u64> {
    position_size
        .checked_mul(liquidation_threshold_bps)
        .ok_or(SolPerpError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(SolPerpError::MathOverflow.into())
}

pub fn calculate_trading_fee(position_size: u64, trading_fees_bps: u64) -> Result<u64> {
    position_size
        .checked_mul(trading_fees_bps)
        .ok_or(SolPerpError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(SolPerpError::MathOverflow.into())
}
