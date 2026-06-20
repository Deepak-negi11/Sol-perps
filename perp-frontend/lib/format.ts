import { BN } from "@coral-xyz/anchor";

export function formatTokenAmount(amount: BN | number, decimals: number = 6): string {
  const rawNumber = typeof amount === "number" ? amount : amount.toNumber();
  const value = rawNumber / Math.pow(10, decimals);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(decimals > 2 ? 2 : decimals);
}

export function formatUsd(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function shortenAddress(addr: string, chars: number = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function tokenToLamports(amount: number, decimals: number = 6): BN {
  return new BN(Math.floor(amount * Math.pow(10, decimals)));
}

export function lamportsToToken(amount: BN | number, decimals: number = 6): number {
  const rawNumber = typeof amount === "number" ? amount : amount.toNumber();
  return rawNumber / Math.pow(10, decimals);
}
