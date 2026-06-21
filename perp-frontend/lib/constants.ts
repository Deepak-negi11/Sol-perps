import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "7oYnX6upn2jhobcxUoarHs7MyyiF7ieZgzMGcjfQhrrD",
);

export const MARKET_SEED = "market";
export const USER_COLLATERAL_SEED = "user_collateral";
export const POSITION_SEED = "position";
export const VAULT_SEED = "vault";
export const ORDER_SEED = "order";


export type MarketSymbol = "SOLHYPE";

export const MARKET_SYMBOLS: MarketSymbol[] = ["SOLHYPE"];


export const MARKET_BASE_FEED_IDS: Record<MarketSymbol, string> = {
  SOLHYPE: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
};

export const MARKET_QUOTE_FEED_IDS: Record<MarketSymbol, string> = {
  SOLHYPE: "4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b",
};

export const MARKET_LABELS: Record<MarketSymbol, string> = {
  SOLHYPE: "SOL/HYPE",
};

export const DEVNET_COLLATERAL_MINT =
  "AMdThvkbfjD3ynTLgG6kaTun2obhKyQ1ceqJN1pkTZPq";

export const LEGACY_MARKET_PDA = new PublicKey(
  "BmbtFPVYrjiS5hYC4GaT3cak4zuKD8FV4MEuEjRqoJMR",
);

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const COLLATERAL_DECIMALS = 6;
