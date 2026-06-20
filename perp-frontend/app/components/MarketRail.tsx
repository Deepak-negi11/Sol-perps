"use client";

import React from "react";

export type TerminalMarket = "SOL" | "ETH" | "WBTC";

const MARKET_ICONS: Record<TerminalMarket, React.ReactNode> = {
  SOL: (
    <div style={{
      width: "22px",
      height: "22px",
      borderRadius: "50%",
      backgroundColor: "#000000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4.5px"
    }}>
      <svg viewBox="0 0 397.7 311.7" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sol-a" x1="360.88" y1="351.46" x2="141.21" y2="-6.39" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
          <linearGradient id="sol-b" x1="264.83" y1="401.6" x2="45.16" y2="43.74" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
          <linearGradient id="sol-c" x1="312.55" y1="376.69" x2="92.88" y2="18.84" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
        </defs>
        <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z" fill="url(#sol-a)" />
        <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z" fill="url(#sol-b)" />
        <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1z" fill="url(#sol-c)" />
      </svg>
    </div>
  ),
  ETH: (
    <div style={{
      width: "22px",
      height: "22px",
      borderRadius: "50%",
      backgroundColor: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4px"
    }}>
      <svg viewBox="0 0 256 417" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <path d="M127.96 0l-2.8 9.5V285l2.8 2.8 127.96-75.6z" fill="#343434" />
        <path d="M127.96 0L0 212.2l127.96 75.6V0z" fill="#8C8C8C" />
        <path d="M127.96 312.2l-1.6 1.9v98.2l1.6 4.7L256 236.6z" fill="#3C3C3B" />
        <path d="M127.96 417V312.2L0 236.6z" fill="#8C8C8C" />
        <path d="M127.96 287.8L255.92 212.2 127.96 154.2z" fill="#141414" />
        <path d="M0 212.2l127.96 75.6V154.2z" fill="#393939" />
      </svg>
    </div>
  ),
  WBTC: (
    <svg viewBox="0 0 64 64" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="32" fill="#F7931A" />
      <path
        d="M46.1 27.4c.6-4.2-2.6-6.5-7-8l1.4-5.7-3.5-.9-1.4 5.5c-.9-.2-1.9-.4-2.8-.7l1.4-5.6-3.5-.9-1.4 5.7c-.8-.2-1.5-.3-2.2-.5l0 0-4.8-1.2-.9 3.7s2.6.6 2.5.6c1.4.4 1.7 1.3 1.6 2l-1.6 6.6c.1 0 .2 0 .3.1l-.3-.1-2.3 9.1c-.2.4-.6 1.1-1.6.8 0 0-2.5-.6-2.5-.6l-1.7 4 4.5 1.1c.8.2 1.7.4 2.5.6l-1.4 5.8 3.5.9 1.4-5.7c1 .3 1.9.5 2.8.7l-1.4 5.6 3.5.9 1.4-5.8c6 1.1 10.5.7 12.4-4.7 1.5-4.4-.1-6.9-3.2-8.5 2.3-.5 4-2.1 4.5-5.2zm-8 11.3c-1.1 4.4-8.4 2-10.8 1.4l1.9-7.7c2.4.6 10 1.8 8.9 6.3zm1.1-11.4c-1 4-7.1 2-9.1 1.5l1.8-7c2 .5 8.4 1.4 7.3 5.5z"
        fill="#fff"
      />
    </svg>
  ),
};

const markets: Array<{
  symbol: TerminalMarket;
  label: string;
}> = [
  { symbol: "SOL", label: "SOL" },
  { symbol: "ETH", label: "ETH" },
  { symbol: "WBTC", label: "WBTC" },
];

interface MarketRailProps {
  selectedMarket: TerminalMarket;
  onSelectMarket: (market: TerminalMarket) => void;
  tickers?: Partial<Record<TerminalMarket, { priceChangePercent: number }>>;
}

export default function MarketRail({
  selectedMarket,
  onSelectMarket,
  tickers = {},
}: MarketRailProps) {
  return (
    <aside className="market-rail" aria-label="Markets">
      {markets.map((market) => {
        const changePercent = tickers[market.symbol]?.priceChangePercent;
        const isUp = (changePercent ?? 0) >= 0;

        return (
          <div className="rail-item" key={market.symbol}>
            <button
              className={
                market.symbol === selectedMarket
                  ? "rail-market active"
                  : "rail-market"
              }
              onClick={() => onSelectMarket(market.symbol)}
              title={market.label}
            >
              <span className="rail-token-icon">{MARKET_ICONS[market.symbol]}</span>
              <span className="rail-token-label">{market.label}</span>
            </button>
            <span className={isUp ? "rail-change up" : "rail-change down"}>
              {typeof changePercent === "number"
                ? `${isUp ? "+" : ""}${changePercent.toFixed(2)}%`
                : "-"}
            </span>
          </div>
        );
      })}
    </aside>
  );
}
