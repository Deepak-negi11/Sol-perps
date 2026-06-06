import { PublicKey } from "@solana/web3.js";
import {
  MARKET_SEED,
  MARKET_FEED_IDS,
  type MarketSymbol,
  ORDER_SEED,
  POSITION_SEED,
  PROGRAM_ID,
  USER_COLLATERAL_SEED,
  VAULT_SEED,
} from "./constants";

// These helpers must stay in sync with the Anchor account seeds. If a seed
// changes in Rust, the frontend will derive a different address and fetch/send
// transactions against the wrong account.

function u64LeBuffer(value: number): Buffer {
  let remaining = BigInt(value);
  const byteMask = BigInt(255);
  const bytes = new Uint8Array(8);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & byteMask);
    remaining /= BigInt(256);
  }
  return Buffer.from(bytes);
}

export function getMarketPda(marketSymbol: MarketSymbol = "SOL"): PublicKey {
  const feedId = Buffer.from(MARKET_FEED_IDS[marketSymbol], "hex");
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), feedId],
    PROGRAM_ID,
  )[0];
}

export function getUserCollateralPda(
  user: PublicKey,
  _marketSymbol?: MarketSymbol,
): PublicKey {
  // USDC margin is shared across every market for this wallet.
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
  marketSymbol: MarketSymbol = "SOL",
): PublicKey {
  // Legacy positions used one PDA per user. New positions include a client-side
  // position id so one wallet can keep multiple positions open.
  const market = getMarketPda(marketSymbol);
  const seeds = [Buffer.from(POSITION_SEED), market.toBuffer(), user.toBuffer()];
  if (positionId !== undefined) {
    seeds.push(u64LeBuffer(positionId));
  }
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

export function getOrderPda(
  user: PublicKey,
  orderId: number,
  marketSymbol: MarketSymbol = "SOL",
): PublicKey {
  // Trigger orders include the u64 order id in little-endian form to match the
  // Anchor seeds used by placeLimitOrder/placeTpSlOrder.
  const market = getMarketPda(marketSymbol);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(ORDER_SEED),
      market.toBuffer(),
      user.toBuffer(),
      u64LeBuffer(orderId),
    ],
    PROGRAM_ID,
  )[0];
}

export function getVaultAuthorityPda(): PublicKey {
  // Program signer that owns the collateral vault token account.
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED)],
    PROGRAM_ID,
  )[0];
}

export function getPythPriceUpdatePda(feedIdBytes: number[]): PublicKey {
  // Pyth price update accounts are owned by the Pyth receiver program, not by
  // this perp program, so they use a different program id for derivation.
  const pythProgramId = new PublicKey(
    "HMHZhN31Q7ERSR2ekrPKbjqYc7icK7eqkoDZ6sEdHzv8",
  );
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price_update_v2"), Buffer.from(feedIdBytes)],
    pythProgramId,
  )[0];
}
