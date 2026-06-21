"use client";

import { useState, useEffect } from "react";
import {
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

// Streams the two underlying feeds (SOL + HYPE) and returns their RATIO as the
// price, so Mark Price = price(SOL) / price(HYPE).
export function usePythPrice(marketSymbol: MarketSymbol = "SOLHYPE") {
  const [priceData, setPriceData] = useState<PythPriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const baseId = MARKET_BASE_FEED_IDS[marketSymbol];
    const quoteId = MARKET_QUOTE_FEED_IDS[marketSymbol];

    const pythServer = new HermesClient("https://hermes.pyth.network");

    let priceStream:
      | Awaited<ReturnType<typeof pythServer.getPriceUpdatesStream>>
      | null = null;
    let stopped = false;

    // Latest price for each leg; we can only form the ratio once both arrived.
    let latestBase: number | null = null;
    let latestQuote: number | null = null;

    async function startStream() {
      priceStream = await pythServer.getPriceUpdatesStream(
        [`0x${baseId}`, `0x${quoteId}`],
        { parsed: true },
      );

      if (stopped) {
        priceStream.close();
        return;
      }

      priceStream.onmessage = (message) => {
        const update = JSON.parse(message.data);
        const parsedPrices = update.parsed;
        if (!parsedPrices) return;

        for (const entry of parsedPrices) {
          const value = Number(entry.price.price) * Math.pow(10, entry.price.expo);
          // Hermes reports the feed id without the "0x" prefix.
          if (entry.id === baseId) latestBase = value;
          else if (entry.id === quoteId) latestQuote = value;
        }

        if (latestBase !== null && latestQuote !== null && latestQuote > 0) {
          setPriceData({
            price: latestBase / latestQuote,
            basePrice: latestBase,
            quotePrice: latestQuote,
            confidence: 0,
            publishTime: Math.floor(Date.now() / 1000),
          });
          setLoading(false);
          setConnected(true);
        }
      };

      priceStream.onerror = () => setConnected(false);
    }

    startStream();

    return () => {
      stopped = true;
      priceStream?.close();
      setConnected(false);
    };
  }, [marketSymbol]);

  return { priceData, loading, connected };
}
