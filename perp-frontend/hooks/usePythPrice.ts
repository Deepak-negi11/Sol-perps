"use client";

import { useState, useEffect } from "react";
import {
  DEFAULT_MARKET,
  MARKET_BASE_FEED_IDS,
  MARKET_QUOTE_FEED_IDS,
  type MarketSymbol,
} from "@/lib/constants";
import { HermesClient } from "@pythnetwork/hermes-client";

interface PythPriceData {
  price: number;
  basePrice: number;
  quotePrice: number;
  confidence: number;
  publishTime: number;
}

function readPythPrice(parsedPrice: {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
}) {
  return {
    price: Number(parsedPrice.price) * Math.pow(10, parsedPrice.expo),
    confidence: Number(parsedPrice.conf) * Math.pow(10, parsedPrice.expo),
    publishTime: parsedPrice.publish_time,
  };
}

export function usePythPrice(marketSymbol: MarketSymbol = DEFAULT_MARKET) {
  const [priceData, setPriceData] = useState<PythPriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const feedIds = [
      `0x${MARKET_BASE_FEED_IDS[marketSymbol]}`,
      `0x${MARKET_QUOTE_FEED_IDS[marketSymbol]}`,
    ];
    const hermes = new HermesClient("https://hermes.pyth.network");

    let eventSource: Awaited<ReturnType<typeof hermes.getPriceUpdatesStream>>
      | null = null;
    let cancelled = false;

    async function startStream() {
      eventSource = await hermes.getPriceUpdatesStream(feedIds, {
        parsed: true,
      });
      if (cancelled) { eventSource.close(); return; }

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const parsed = data.parsed;
        if (parsed && parsed.length >= 2) {
          const base = readPythPrice(parsed[0].price);
          const quote = readPythPrice(parsed[1].price);
          const ratio = quote.price > 0 ? base.price / quote.price : 0;
          setPriceData({
            price: ratio,
            basePrice: base.price,
            quotePrice: quote.price,
            confidence: base.confidence + quote.confidence,
            publishTime: Math.min(base.publishTime, quote.publishTime),
          });
          setLoading(false);
          setConnected(true);
        }
      };

      // If the connection drops, mark it disconnected (we could reconnect
      eventSource.onerror = () => setConnected(false);
    }

    startStream();

    return () => {
      cancelled = true;
      eventSource?.close();
      setConnected(false);
    };
  }, [marketSymbol]);
  return { priceData, loading, connected };
}
