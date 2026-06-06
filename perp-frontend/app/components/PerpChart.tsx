"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import { type TerminalMarket } from "./MarketRail";

interface PerpChartProps {
  price: number;
  timeframe: ChartTimeframe;
  market: TerminalMarket;
}

const CHART_END_TIME = 1780502400;

export type ChartTimeframe = "5m" | "15m" | "1h";

const TIMEFRAME_CONFIG: Record<
  ChartTimeframe,
  {
    candles: number;
    seconds: number;
    volatility: number;
    binanceInterval: string;
  }
> = {
  "5m": {
    candles: 120,
    seconds: 5 * 60,
    volatility: 0.008,
    binanceInterval: "5m",
  },
  "15m": {
    candles: 120,
    seconds: 15 * 60,
    volatility: 0.014,
    binanceInterval: "15m",
  },
  "1h": {
    candles: 120,
    seconds: 60 * 60,
    volatility: 0.028,
    binanceInterval: "1h",
  },
};

const BINANCE_SYMBOLS: Record<TerminalMarket, string> = {
  SOL: "SOLUSDC",
  ETH: "ETHUSDC",
  WBTC: "BTCUSDC",
};

export default function PerpChart({
  price,
  timeframe,
  market,
}: PerpChartProps) {
  // lightweight-charts is imperative, so refs hold the chart instance and series
  // while React state holds only the candle data source.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const didFitContentRef = useRef(false);
  const lastTimeframeRef = useRef<ChartTimeframe>(timeframe);
  const lastMarketRef = useRef<TerminalMarket>(market);
  const [remoteCandles, setRemoteCandles] = useState<{
    candles: CandlestickData<UTCTimestamp>[];
    volume: HistogramData<UTCTimestamp>[];
  } | null>(null);

  // Synthetic candles are a safety net for local/devnet work when Binance is
  // unavailable. They keep the chart usable without pretending to be chain data.
  const fallbackData = useMemo(() => {
    const safePrice = Number.isFinite(price) && price > 0 ? price : 75;
    const config = TIMEFRAME_CONFIG[timeframe];
    const start = CHART_END_TIME - config.candles * config.seconds;
    const midpoint = config.candles / 2;
    const candleData = Array.from({ length: config.candles }, (_, i) => {
      const wave =
        Math.sin(i / 5) * config.volatility +
        Math.cos(i / 11) * config.volatility * 0.75;
      const drift = (i - midpoint) * config.volatility * 0.055;
      const center = safePrice * (1 + wave + drift);
      const open = center * (1 + Math.sin(i * 1.7) * 0.0028);
      const close = center * (1 + Math.cos(i * 1.3) * 0.0032);
      const high = Math.max(open, close) * (1 + 0.002 + (i % 5) * 0.00055);
      const low = Math.min(open, close) * (1 - 0.002 - (i % 4) * 0.0005);

      return {
        time: (start + i * config.seconds) as UTCTimestamp,
        open,
        high,
        low,
        close,
      };
    });

    const volumeData = candleData.map((item, i) => ({
      time: item.time,
      value: Math.round(180 + Math.abs(Math.sin(i / 4)) * 260 + (i % 7) * 36),
      color:
        item.close >= item.open
          ? "rgba(0, 184, 166, 0.32)"
          : "rgba(255, 48, 70, 0.32)",
    }));

    return { candles: candleData, volume: volumeData };
  }, [price, timeframe]);

  // Pull public spot candles for the selected preview market and timeframe.
  // These candles are visual only; contract execution still depends on Pyth.
  useEffect(() => {
    const abort = new AbortController();
    const config = TIMEFRAME_CONFIG[timeframe];
    const symbol = BINANCE_SYMBOLS[market];

    async function fetchCandles() {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${config.binanceInterval}&limit=${config.candles}`,
          { signal: abort.signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = (await response.json()) as unknown[][];
        const candles: CandlestickData<UTCTimestamp>[] = rows.map((row) => ({
          time: Math.floor(Number(row[0]) / 1000) as UTCTimestamp,
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
        }));
        const volume: HistogramData<UTCTimestamp>[] = rows.map((row) => {
          const open = Number(row[1]);
          const close = Number(row[4]);
          return {
            time: Math.floor(Number(row[0]) / 1000) as UTCTimestamp,
            value: Number(row[5]),
            color:
              close >= open
                ? "rgba(0, 184, 166, 0.32)"
                : "rgba(255, 48, 70, 0.32)",
          };
        });
        setRemoteCandles({ candles, volume });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.warn("Falling back to synthetic candles", error);
          setRemoteCandles(null);
        }
      }
    }

    fetchCandles();
    return () => abort.abort();
  }, [market, timeframe]);

  const { candles, volume } = remoteCandles ?? fallbackData;

  // Zooming works by editing the visible logical range, which avoids rebuilding
  // the chart or changing the underlying candle data.
  const zoomChart = (factor: number) => {
    const chart = chartRef.current;
    if (!chart) return;

    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;

    const center = (range.from + range.to) / 2;
    const width = Math.max(8, (range.to - range.from) * factor);
    chart.timeScale().setVisibleLogicalRange({
      from: center - width / 2,
      to: center + width / 2,
    } as LogicalRange);
  };

  const resetZoom = () => {
    chartRef.current?.timeScale().fitContent();
  };

  // Create the chart once. Data updates happen in the next effect so user zoom
  // and pan state are not lost on every price tick.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      layout: {
        background: { type: ColorType.Solid, color: "#05080d" },
        textColor: "#a7adb7",
        panes: {
          separatorColor: "#131922",
          separatorHoverColor: "#29313d",
        },
      },
      grid: {
        vertLines: { color: "rgba(42, 50, 63, 0.45)" },
        horzLines: { color: "rgba(42, 50, 63, 0.45)" },
      },
      rightPriceScale: {
        borderColor: "#111720",
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: "#111720",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(180, 187, 199, 0.68)",
          labelBackgroundColor: "#3a3f4b",
        },
        horzLine: {
          color: "rgba(180, 187, 199, 0.68)",
          labelBackgroundColor: "#3a3f4b",
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00b8a6",
      downColor: "#ff3046",
      wickUpColor: "#00c7b4",
      wickDownColor: "#ff3e54",
      borderVisible: false,
      priceLineColor: "#ff3046",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      didFitContentRef.current = false;
    };
  }, []);

  // Push new candle/volume arrays into the existing series. When the market or
  // timeframe changes, fit once so the new dataset starts in a sensible view.
  useEffect(() => {
    if (
      !chartRef.current ||
      !candleSeriesRef.current ||
      !volumeSeriesRef.current
    ) {
      return;
    }

    if (
      lastTimeframeRef.current !== timeframe ||
      lastMarketRef.current !== market
    ) {
      didFitContentRef.current = false;
      lastTimeframeRef.current = timeframe;
      lastMarketRef.current = market;
    }

    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volume);

    if (!didFitContentRef.current) {
      chartRef.current.timeScale().fitContent();
      didFitContentRef.current = true;
    }
  }, [candles, market, timeframe, volume]);

  return (
    <div className="terminal-chart-stage">
      <div ref={containerRef} className="terminal-chart-canvas" />
      <div className="chart-zoom-controls" aria-label="Chart zoom controls">
        <button aria-label="Zoom in chart" onClick={() => zoomChart(0.72)}>
          <ZoomIn size={15} />
        </button>
        <button aria-label="Zoom out chart" onClick={() => zoomChart(1.35)}>
          <ZoomOut size={15} />
        </button>
        <button aria-label="Reset chart zoom" onClick={resetZoom}>
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
}
