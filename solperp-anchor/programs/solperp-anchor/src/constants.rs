use anchor_lang::prelude::*;

#[constant]
pub const SEED: &str = "anchor";

pub const MARKET_SEED: &[u8] = b"market";

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const USER_COLLATERAL_SEED: &[u8] = b"user_collateral";
pub const VAULT_SEED: &[u8] = b"vault";
pub const POSITION_SEED: &[u8] = b"position";