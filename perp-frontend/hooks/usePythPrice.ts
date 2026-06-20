"use client";

import { useState, useEffect } from "react";
import { MARKET_FEED_IDS, type MarketSymbol } from "@/lib/constants";
import { HermesClient } from "@pythnetwork/hermes-client";

interface PythPriceData {
  price: number;
  confidence: number;
  publishTime: number;
}

export function usePythPrice(marketSymbol: MarketSymbol = "SOL") {
  const [priceData, setPriceData] = useState<PythPriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const pythFeedId = `0x${MARKET_FEED_IDS[marketSymbol]}`;

    const pythServer = new HermesClient("https://hermes.pyth.network");

    let priceStream:
      | Awaited<ReturnType<typeof pythServer.getPriceUpdatesStream>>
      | null = null;

    let stopped = false;

    async function startStream() {
      priceStream = await pythServer.getPriceUpdatesStream([pythFeedId], {
        parsed: true,
      });

      if (stopped) {
        priceStream.close();
        return;
      }

      priceStream.onmessage = (message) => {
        const update = JSON.parse(message.data);
        const parsedPrices = update.parsed;

        if (parsedPrices && parsedPrices.length > 0) {
          const priceInfo = parsedPrices[0].price;

          const price = Number(priceInfo.price) * Math.pow(10, priceInfo.expo);
          const confidence =
            Number(priceInfo.conf) * Math.pow(10, priceInfo.expo);

          setPriceData({
            price,
            confidence,
            publishTime: priceInfo.publish_time,
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
