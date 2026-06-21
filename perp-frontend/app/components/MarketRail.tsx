"use client";

import React from "react";
import { MARKET_SYMBOLS, MARKET_LABELS, type MarketSymbol } from "@/lib/constants";

export type TerminalMarket = MarketSymbol;

interface MarketRailProps {
  selectedMarket: TerminalMarket;
  onSelectMarket: (market: TerminalMarket) => void;
  tickers?: Partial<Record<TerminalMarket, { priceChangePercent: number }>>;
}

export default function MarketRail({
  selectedMarket,
  onSelectMarket,
}: MarketRailProps) {
  return (
    <aside className="market-rail" aria-label="Markets">
      {MARKET_SYMBOLS.map((symbol) => (
        <div className="rail-item" key={symbol}>
          <button
            className={
              symbol === selectedMarket ? "rail-market active" : "rail-market"
            }
            onClick={() => onSelectMarket(symbol)}
            title={MARKET_LABELS[symbol]}
          >
            <span className="rail-token-label">{MARKET_LABELS[symbol]}</span>
          </button>
        </div>
      ))}
    </aside>
  );
}
