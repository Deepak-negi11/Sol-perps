"use client"

import { useEffect, useState } from "react"
import { useConnection } from "@solana/wallet-adapter-react"
import { PROGRAM_ID, type MarketSymbol } from "@/lib/constants"
import { LiveTrade, parseTradeEventsFromLogs } from "@/lib/events"


const MAX_TRADES = 50;

export function useLiveTrades(marketSymbol?: MarketSymbol) {
    const { connection } = useConnection();
    const [trades, setTrades] = useState<LiveTrade[]>([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const connectedTimer = window.setTimeout(() => setConnected(true), 0);
        const subId = connection.onLogs(
            PROGRAM_ID,
            (logsInfo) => {
                if (logsInfo.err || !logsInfo.logs?.length) return;
                const parsed = parseTradeEventsFromLogs(logsInfo.logs, logsInfo.signature);
                if (!parsed.length) return;
                setTrades((prev) => [...parsed.reverse(), ...prev].slice(0, MAX_TRADES));
            },
            "confirmed"
        );
        return () => {
            window.clearTimeout(connectedTimer);
            connection.removeOnLogsListener(subId);
            setConnected(false);
        };
    }, [connection]);

    const filtered = marketSymbol
        ? trades.filter((t) => t.marketSymbol === marketSymbol)
        : trades;
    return { trades: filtered, connected };


}