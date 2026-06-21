"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PROGRAM_ID, type MarketSymbol } from "@/lib/constants";
import { parseTradeEventsFromLogs, type LiveTrade } from "@/lib/events";

const MAX_TRADES = 50;

export function useLiveTrades(marketSymbol?: MarketSymbol) {
  const { connection } = useConnection();
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const connectedTimer = window.setTimeout(() => setConnected(true), 0);

    const subscriptionId = connection.onLogs(
      PROGRAM_ID,
      (logInfo) => {
        if (logInfo.err || !logInfo.logs?.length) return;
        const newTrades = parseTradeEventsFromLogs(
          logInfo.logs,
          logInfo.signature,
        );
        if (!newTrades.length) return;
        setTrades((current) =>
          [...newTrades.reverse(), ...current].slice(0, MAX_TRADES),
        );
      },
      "confirmed",
    );

    return () => {
      window.clearTimeout(connectedTimer);
      connection.removeOnLogsListener(subscriptionId);
      setConnected(false);
    };
  }, [connection]);

  const filtered = marketSymbol
    ? trades.filter((trade) => trade.marketSymbol === marketSymbol)
    : trades;

  return { trades: filtered, connected };
}
