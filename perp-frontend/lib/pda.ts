import { PublicKey } from "@solana/web3.js";
import {
  MARKET_SEED,
  DEFAULT_MARKET,
  MARKET_BASE_FEED_IDS,
  MARKET_QUOTE_FEED_IDS,
  type MarketSymbol,
  ORDER_SEED,
  POSITION_SEED,
  PROGRAM_ID,
  USER_COLLATERAL_SEED,
  VAULT_SEED,
} from "./constants";

function u64ToLittleEndianBytes(value: number): Buffer {
  let remaining = BigInt(value);
  const lowestByteMask = BigInt(255);
  const bytes = new Uint8Array(8);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & lowestByteMask);
    remaining /= BigInt(256);
  }
  return Buffer.from(bytes);
}



export function getMarketPda(marketSymbol: MarketSymbol = DEFAULT_MARKET): PublicKey {
  const baseFeedBytes = Buffer.from(MARKET_BASE_FEED_IDS[marketSymbol], "hex");
  const quoteFeedBytes = Buffer.from(MARKET_QUOTE_FEED_IDS[marketSymbol], "hex");
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), baseFeedBytes, quoteFeedBytes],
    PROGRAM_ID,
  )[0];
}

export function getUserCollateralPda(
  user: PublicKey,
  _marketSymbol?: MarketSymbol,
): PublicKey {
  void _marketSymbol;
  return PublicKey.findProgramAddressSync(
    [Buffer.from(USER_COLLATERAL_SEED), user.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function getLegacyUserCollateralPda(
  user: PublicKey,
  legacyMarket: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(USER_COLLATERAL_SEED), legacyMarket.toBuffer(), user.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function getPositionPda(
  user: PublicKey,
  positionId?: number,
  marketSymbol: MarketSymbol = DEFAULT_MARKET,
): PublicKey {
  const market = getMarketPda(marketSymbol);
  const seeds = [Buffer.from(POSITION_SEED), market.toBuffer(), user.toBuffer()];
  if (positionId !== undefined) {
    seeds.push(u64ToLittleEndianBytes(positionId));
  }
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

export function getOrderPda(
  user: PublicKey,
  orderId: number,
  marketSymbol: MarketSymbol = DEFAULT_MARKET,
): PublicKey {
  const market = getMarketPda(marketSymbol);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(ORDER_SEED),
      market.toBuffer(),
      user.toBuffer(),
      u64ToLittleEndianBytes(orderId),
    ],
    PROGRAM_ID,
  )[0];
}

export function getVaultAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED)],
    PROGRAM_ID,
  )[0];
}

export function getPythPriceUpdatePda(feedIdBytes: number[]): PublicKey {
  const pythReceiverProgramId = new PublicKey(
    "HMHZhN31Q7ERSR2ekrPKbjqYc7icK7eqkoDZ6sEdHzv8",
  );
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price_update_v2"), Buffer.from(feedIdBytes)],
    pythReceiverProgramId,
  )[0];
}
