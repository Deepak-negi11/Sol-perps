use anchor_lang::prelude::*;
use std::io::Write;

pub const MAXIMUM_PRICE_AGE_SECONDS: u64 = 300;
pub const MAX_CONFIDENCE_BPS: i64 = 100;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum VerificationLevel {
    Partial { num_signatures: u8 },
    Full,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct PriceFeedMessage {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
    pub prev_publish_time: i64,
    pub ema_price: i64,
    pub ema_conf: u64,
}

#[derive(Clone)]
pub struct PriceUpdateV2 {
    pub write_authority: Pubkey,
    pub verification_level: VerificationLevel,
    pub price_message: PriceFeedMessage,
    pub posted_slot: u64,
}

impl anchor_lang::Discriminator for PriceUpdateV2 {
    const DISCRIMINATOR: &'static [u8] = &[34, 241, 35, 99, 157, 126, 244, 205];
}

impl anchor_lang::Owner for PriceUpdateV2 {
    fn owner() -> Pubkey {
        // rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ (Pyth Receiver Program)
        let bytes: [u8; 32] = [
            242, 237, 85, 238, 18, 93, 219, 137, 198, 145, 150, 48, 12, 19, 214, 115, 6, 219, 149,
            112, 129, 234, 172, 123, 144, 252, 169, 10, 48, 203, 31, 237,
        ];
        Pubkey::new_from_array(bytes)
    }
}

impl anchor_lang::AccountDeserialize for PriceUpdateV2 {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        if buf.len() < 8 {
            return Err(anchor_lang::error::ErrorCode::AccountDiscriminatorNotFound.into());
        }
        let discriminator = &buf[..8];
        if discriminator != Self::DISCRIMINATOR {
            return Err(anchor_lang::error::ErrorCode::AccountDiscriminatorMismatch.into());
        }
        let mut data = &buf[8..];
        let write_authority = Pubkey::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        let verification_level = VerificationLevel::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        let price_message = PriceFeedMessage::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        let posted_slot = u64::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        *buf = data;
        Ok(Self {
            write_authority,
            verification_level,
            price_message,
            posted_slot,
        })
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        let mut data = *buf;
        if data.len() >= 8 {
            data = &data[8..];
        }
        let write_authority = Pubkey::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        let verification_level = VerificationLevel::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        let price_message = PriceFeedMessage::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        let posted_slot = u64::deserialize(&mut data)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        *buf = data;
        Ok(Self {
            write_authority,
            verification_level,
            price_message,
            posted_slot,
        })
    }
}

impl anchor_lang::AccountSerialize for PriceUpdateV2 {
    fn try_serialize<W: Write>(&self, writer: &mut W) -> Result<()> {
        writer
            .write_all(Self::DISCRIMINATOR)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        self.write_authority
            .serialize(writer)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        self.verification_level
            .serialize(writer)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        self.price_message
            .serialize(writer)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        self.posted_slot
            .serialize(writer)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        Ok(())
    }
}

pub fn get_price_from_pyth(price_update_info: &AccountInfo, feed_id: &[u8; 32]) -> Result<u64> {
    let owner = price_update_info.owner;
    let devnet_pyth = Pubkey::new_from_array([
        242, 237, 85, 238, 18, 93, 219, 137, 198, 145, 150, 48, 12, 19, 214, 115, 6, 219, 149, 112,
        129, 234, 172, 123, 144, 252, 169, 10, 48, 203, 31, 237,
    ]); // HMHZhN31Q7ERSR2ekrPKbjqYc7icK7eqkoDZ6sEdHzv8
    let mainnet_pyth = Pubkey::new_from_array([
        12, 183, 250, 187, 82, 247, 166, 72, 187, 91, 49, 125, 154, 1, 139, 144, 87, 203, 2, 71,
        116, 250, 254, 1, 230, 196, 223, 152, 204, 56, 88, 129,
    ]); // rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ

    require!(
        owner == &devnet_pyth || owner == &mainnet_pyth,
        crate::error::SolPerpError::InvalidOraclePrice
    );

    let mut data = &price_update_info.try_borrow_data()?[..];
    let price_update = PriceUpdateV2::try_deserialize(&mut data)?;

    let clock = Clock::get()?;

    // Check feed ID
    require!(
        &price_update.price_message.feed_id == feed_id,
        crate::error::SolPerpError::InvalidOraclePrice
    );

    // Check price age
    let current_time = clock.unix_timestamp;
    let publish_time = price_update.price_message.publish_time;
    require!(
        publish_time > 0 && current_time >= publish_time,
        crate::error::SolPerpError::InvalidOraclePrice
    );
    let age = current_time
        .checked_sub(publish_time)
        .ok_or(crate::error::SolPerpError::MathOverflow)?;
    require!(
        age as u64 <= MAXIMUM_PRICE_AGE_SECONDS,
        crate::error::SolPerpError::InvalidOraclePrice
    );

    let price = &price_update.price_message;
    require!(
        price.price > 0,
        crate::error::SolPerpError::InvalidOraclePrice
    );

    // Confidence check
    let abs_price = price.price.abs();
    require!(
        (price.conf as i64)
            .checked_mul(10_000)
            .ok_or(crate::error::SolPerpError::MathOverflow)?
            <= abs_price
                .checked_mul(MAX_CONFIDENCE_BPS)
                .ok_or(crate::error::SolPerpError::MathOverflow)?,
        crate::error::SolPerpError::OracleConfidenceTooWide
    );

    normalize_price_to_6_decimals(price.price, price.exponent)
}

fn normalize_price_to_6_decimals(price: i64, exponent: i32) -> Result<u64> {
    require!(price > 0, crate::error::SolPerpError::InvalidOraclePrice);

    let price_u128 = price as u128;

    let target_exponent = exponent
        .checked_add(6)
        .ok_or(crate::error::SolPerpError::MathOverflow)?;

    let normalized = if target_exponent >= 0 {
        let multiplier = 10u128
            .checked_pow(target_exponent as u32)
            .ok_or(crate::error::SolPerpError::MathOverflow)?;

        price_u128
            .checked_mul(multiplier)
            .ok_or(crate::error::SolPerpError::MathOverflow)?
    } else {
        let divisor = 10u128
            .checked_pow((-target_exponent) as u32)
            .ok_or(crate::error::SolPerpError::MathOverflow)?;

        price_u128
            .checked_div(divisor)
            .ok_or(crate::error::SolPerpError::MathOverflow)?
    };

    require!(
        normalized <= u64::MAX as u128,
        crate::error::SolPerpError::MathOverflow
    );

    Ok(normalized as u64)
}

#[cfg(feature = "idl-build")]
impl anchor_lang::IdlBuild for PriceUpdateV2 {}
