"use client"

import { useLiveTrades } from "@/hooks/useLiveTrades";
import { formatUsd } from "@/lib/format";
import type { MarketSymbol } from "@/lib/constants";

export default function LiveTrades({market}:{market?: MarketSymbol}){
    const {trades} = useLiveTrades(market);

    if(!trades.length){
        return <div className ="dock-empty"> Waiting for the live trades..</div>

    }
    return (
        <div className=" positions-table-wrapper">
            <table className="history-grid-table">
                <thead>
                    <tr>
                        <th> Time</th><th>Market</th><th>Action</th>
                        <th> Side</th><th>Price</th><th>Size</th>
                    </tr>
                </thead>
                <tbody>
                    {trades.map((t)=>(
                        
                        <tr key = {t.id}>
                            <td>
                                {new Date(t.ts).toLocaleDateString()}
                            </td>
                            <td>
                                {t.marketSymbol}
                            </td>
                            <td>
                                <td className={t.isLong ? "text-long":"text-short"}>
                                    {t.isLong ? "Long" : "Short"}
                                </td>
                                <td>
                                    {formatUsd(t.price)}
                                </td>
                                <td>{t.size === null ? "-" : formatUsd(t.size)}</td>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}