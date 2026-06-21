"use client";

import { ExternalLink, RadioTower, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { useLiveTrades } from "@/hooks/useLiveTrades";
import { formatUsd, lamportsToToken } from "@/lib/format";
import type { MarketData } from "@/hooks/useMarket";
import type { MarketSymbol } from "@/lib/constants";

interface OnChainActivityProps {
  market: MarketData | null;
  marketSymbol: MarketSymbol;
}

export default function OnChainActivity({
  market,
  marketSymbol,
}: OnChainActivityProps) {
  const { trades } = useLiveTrades(marketSymbol);
  const { history } = useTradeHistory();

  const liveRows = trades.slice(0, 5).map((trade) => ({
    id: trade.id,
    label: `${trade.action} ${trade.isLong ? "long" : "short"}`,
    value: trade.size === null ? formatUsd(trade.price) : formatUsd(trade.size),
    side: trade.isLong ? "up" : "down",
    age: "live",
    href: null,
  }));

  const historyRows = history.slice(0, 8).map((item) => ({
    id: item.id,
    label:
      item.action === "Liquidated"
        ? "Liquidation"
        : item.action === "Closed"
          ? "Position close"
          : `${item.isLong ? "Long" : "Short"} open`,
    value:
      item.pnl === null
        ? item.collateral === null
          ? formatUsd(item.price)
          : formatUsd(item.collateral)
        : `${item.pnl >= 0 ? "+" : ""}${formatUsd(item.pnl)}`,
    side: item.pnl !== null ? (item.pnl >= 0 ? "up" : "down") : item.isLong ? "up" : "down",
    age: item.blockTime
      ? new Date(item.blockTime * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "-",
    href: `https://explorer.solana.com/tx/${item.signature}?cluster=devnet`,
  }));

  const rows = [...liveRows, ...historyRows].slice(0, 11);
  const vaultBalance = market ? lamportsToToken(market.poolBalance) : 0;

  return (
    <section className="activity-panel" aria-label="On-chain activity">
      <div className="activity-head">
        <div>
          <RadioTower size={14} />
          <strong>On-chain activity</strong>
        </div>
        <span>live · verify rows</span>
      </div>

      <div className="activity-vault">
        <WalletCards size={14} />
        <span>Vault on-chain</span>
        <strong>{formatUsd(vaultBalance)}</strong>
      </div>

      <div className="activity-list">
        {rows.length ? (
          rows.map((row) => {
            const Icon = row.side === "up" ? TrendingUp : TrendingDown;
            const content = (
              <>
                <Icon size={13} />
                <span>{row.label}</span>
                <strong className={row.side === "up" ? "text-long" : "text-short"}>
                  {row.value}
                </strong>
                <em>{row.age}</em>
                {row.href ? <ExternalLink size={11} /> : null}
              </>
            );

            return row.href ? (
              <a
                className="activity-row"
                href={row.href}
                key={row.id}
                rel="noreferrer"
                target="_blank"
              >
                {content}
              </a>
            ) : (
              <div className="activity-row" key={row.id}>
                {content}
              </div>
            );
          })
        ) : (
          <div className="activity-empty">Waiting for {marketSymbol} events…</div>
        )}
      </div>
    </section>
  );
}
