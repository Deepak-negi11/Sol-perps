"use client";

import { useState, useEffect } from "react";
import { MARKET_FEED_IDS, type MarketSymbol } from "@/lib/constants";

interface PythPriceData {
  price: number;
  confidence: number;
  publishTime: number;
}

export function usePythPrice(marketSymbol: MarketSymbol = "SOL") {
  // Hermes gives the UI a fresh display price. Sending a trade still requires
  // the on-chain Pyth price update account used by the Anchor instruction.
  const [priceData, setPriceData] = useState<PythPriceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        // This endpoint returns the latest parsed SOL/USD price without needing
        // the wallet to sign anything.
        const res = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x${MARKET_FEED_IDS[marketSymbol]}`
        );
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
        }
        const json = await res.json();
        if (cancelled) return;

        const parsed = json.parsed;
        if (parsed && parsed.length > 0) {
          const p = parsed[0].price;
          const price = Number(p.price) * Math.pow(10, p.expo);
          const confidence = Number(p.conf) * Math.pow(10, p.expo);
          setPriceData({
            price,
            confidence,
            publishTime: parsed[0].price.publish_time,
          });
        }
      } catch (e) {
        console.error("Failed to fetch Pyth price:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [marketSymbol]);

  return { priceData, loading };
}
