"use client";

import { useLiveTrades } from "@/hooks/useLiveTrades";
import { formatUsd } from "@/lib/format";
import type { MarketSymbol } from "@/lib/constants";

export default function LiveTrades({ market }: { market?: MarketSymbol }) {
  const { trades } = useLiveTrades(market);

  if (!trades.length) {
    return <div className="dock-empty">Waiting for live trades…</div>;
  }

  return (
    <div className="positions-table-wrapper">
      <table className="history-grid-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Market</th>
            <th>Action</th>
            <th>Side</th>
            <th>Price</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td>{new Date(trade.ts).toLocaleTimeString()}</td>
              <td>{trade.marketSymbol}/USDC</td>
              <td>
                <span className={`history-action ${trade.action.toLowerCase()}`}>
                  {trade.action}
                </span>
              </td>
              <td className={trade.isLong ? "text-long" : "text-short"}>
                {trade.isLong ? "Long" : "Short"}
              </td>
              <td>{formatUsd(trade.price)}</td>
              <td>{trade.size === null ? "-" : formatUsd(trade.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
