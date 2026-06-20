import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "7oYnX6upn2jhobcxUoarHs7MyyiF7ieZgzMGcjfQhrrD",
);

export const MARKET_SEED = "market";
export const USER_COLLATERAL_SEED = "user_collateral";
export const POSITION_SEED = "position";
export const VAULT_SEED = "vault";
export const ORDER_SEED = "order";

export type MarketSymbol = "SOL" | "ETH" | "WBTC";

export const MARKET_FEED_IDS: Record<MarketSymbol, string> = {
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  WBTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
};

export const PYTH_SOL_USD_FEED_ID = MARKET_FEED_IDS.SOL;

export const DEVNET_COLLATERAL_MINT =
  "AMdThvkbfjD3ynTLgG6kaTun2obhKyQ1ceqJN1pkTZPq";

export const LEGACY_MARKET_PDA = new PublicKey(
  "BmbtFPVYrjiS5hYC4GaT3cak4zuKD8FV4MEuEjRqoJMR",
);

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const COLLATERAL_DECIMALS = 6;
