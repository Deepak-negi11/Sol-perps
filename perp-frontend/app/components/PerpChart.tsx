"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, MoveDiagonal, PencilLine, Ruler, Trash2, TrendingUp, ZoomIn, ZoomOut } from "lucide-react";
import {
  CandleType,
  LineType,
  PolygonType,
  TooltipShowRule,
  TooltipShowType,
  YAxisPosition,
  YAxisType,
  dispose,
  init,
  type Chart,
  type DeepPartial,
  type KLineData,
  type Styles,
} from "klinecharts";
import { MARKET_BASE_FEED_IDS, MARKET_QUOTE_FEED_IDS } from "@/lib/constants";
import { type TerminalMarket } from "./MarketRail";

interface PerpChartProps {
  price: number;
  timeframe: ChartTimeframe;
  market: TerminalMarket;
}

export type ChartTimeframe = "5m" | "15m" | "1h";

const RES_PARAM: Record<ChartTimeframe, string> = {
  "5m": "5",
  "15m": "15",
  "1h": "60",
};

const RES_SECONDS: Record<ChartTimeframe, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

const HISTORY_BARS = 400;
const FALLBACK_RATIO_PRICE = 0.04166;
const PYTH_BENCH =
  "https://benchmarks.pyth.network/v1/shims/tradingview/history";

const FEED_ID_TO_SYMBOL: Record<string, string> = {
  [MARKET_BASE_FEED_IDS.SOLHYPE]: "Crypto.SOL/USD",
  [MARKET_QUOTE_FEED_IDS.SOLHYPE]: "Crypto.HYPE/USD",
};

const INDICATORS = ["MA", "EMA", "BOLL", "VOL", "MACD"] as const;
const DRAWING_TOOLS = [
  { label: "Trend", name: "segment", icon: PencilLine },
  { label: "Ray", name: "rayLine", icon: TrendingUp },
  { label: "H-Line", name: "horizontalStraightLine", icon: Minus },
  { label: "Price", name: "priceLine", icon: Ruler },
] as const;

interface Bars {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v?: number[];
}

async function fetchFeedHistory(
  symbol: string,
  resolution: string,
  from: number,
  to: number,
  signal: AbortSignal,
): Promise<Bars> {
  const url = `${PYTH_BENCH}?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as Bars & { s?: string };
  if (json.s !== "ok") throw new Error(`Pyth history status: ${json.s}`);
  return json;
}

function buildRatioCandles(base: Bars, quote: Bars): KLineData[] {
  const quoteByTime = new Map<
    number,
    { o: number; h: number; l: number; c: number; v: number }
  >();

  for (let i = 0; i < quote.t.length; i += 1) {
    quoteByTime.set(quote.t[i], {
      o: quote.o[i],
      h: quote.h[i],
      l: quote.l[i],
      c: quote.c[i],
      v: quote.v?.[i] ?? 0,
    });
  }

  const out: KLineData[] = [];
  for (let i = 0; i < base.t.length; i += 1) {
    const q = quoteByTime.get(base.t[i]);
    if (!q || q.o <= 0 || q.h <= 0 || q.l <= 0 || q.c <= 0) continue;

    const open = base.o[i] / q.o;
    const close = base.c[i] / q.c;
    const high = Math.max(base.h[i] / q.l, open, close);
    const low = Math.min(base.l[i] / q.h, open, close);

    out.push({
      timestamp: base.t[i] * 1000,
      open,
      high,
      low,
      close,
      volume: Math.max(base.v?.[i] ?? 0, q.v, Math.abs(close - open)),
    });
  }

  return out;
}

function buildFallbackCandles(
  timeframe: ChartTimeframe,
  seedPrice: number,
): KLineData[] {
  const seconds = RES_SECONDS[timeframe];
  const count = 180;
  const safePrice =
    Number.isFinite(seedPrice) && seedPrice > 0 ? seedPrice : FALLBACK_RATIO_PRICE;
  const nowBucket = Math.floor(Date.now() / 1000 / seconds) * seconds;
  const start = nowBucket - count * seconds;

  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 9) * 0.0105 + Math.cos(index / 17) * 0.0065;
    const breakout = index > count * 0.55 ? (index - count * 0.55) * 0.00012 : 0;
    const center = safePrice * (1 + wave + breakout);
    const open = center * (1 + Math.sin(index * 1.6) * 0.003);
    const close = center * (1 + Math.cos(index * 1.2) * 0.0034);
    const high = Math.max(open, close) * (1 + 0.0028 + (index % 5) * 0.0004);
    const low = Math.min(open, close) * (1 - 0.0028 - (index % 4) * 0.0004);

    return {
      timestamp: (start + index * seconds) * 1000,
      open,
      high,
      low,
      close,
      volume: 8 + Math.abs(Math.sin(index / 3)) * 26 + (index % 7) * 3,
    };
  });
}

function applyCandles(chart: Chart | null, candles: KLineData[]) {
  if (!chart) return;
  chart.applyNewData(candles, false);
  window.requestAnimationFrame(() => {
    chart.resize();
    chart.setOffsetRightDistance(24);
    chart.scrollToDataIndex(candles.length - 1, 0);
  });
}

const chartStyles: DeepPartial<Styles> = {
  grid: {
    horizontal: {
      show: true,
      color: "rgba(255,255,255,0.055)",
      style: LineType.Solid,
      size: 1,
    },
    vertical: {
      show: true,
      color: "rgba(255,255,255,0.045)",
      style: LineType.Solid,
      size: 1,
    },
  },
  candle: {
    type: CandleType.CandleSolid,
    bar: {
      upColor: "#22c55e",
      downColor: "#ef4444",
      noChangeColor: "#9aa0aa",
      upBorderColor: "#22c55e",
      downBorderColor: "#ef4444",
      noChangeBorderColor: "#9aa0aa",
      upWickColor: "#22c55e",
      downWickColor: "#ef4444",
      noChangeWickColor: "#9aa0aa",
    },
    priceMark: {
      high: { color: "#d9dde5", textFamily: "inherit", textSize: 11 },
      low: { color: "#d9dde5", textFamily: "inherit", textSize: 11 },
      last: {
        upColor: "#22c55e",
        downColor: "#ef4444",
        noChangeColor: "#e11d48",
        line: {
          show: true,
          style: LineType.Dashed,
          size: 1,
          dashedValue: [4, 4],
        },
        text: {
          show: true,
          color: "#fff",
          size: 12,
          family: "inherit",
          weight: 800,
          paddingLeft: 6,
          paddingTop: 3,
          paddingRight: 6,
          paddingBottom: 3,
        },
      },
    },
    tooltip: {
      showRule: TooltipShowRule.FollowCross,
      showType: TooltipShowType.Standard,
      defaultValue: "-",
      text: {
        color: "#f4f5f7",
        size: 12,
        family: "inherit",
        weight: 700,
        marginLeft: 8,
        marginTop: 6,
        marginRight: 8,
        marginBottom: 6,
      },
    },
  },
  indicator: {
    ohlc: {
      upColor: "#22c55e",
      downColor: "#ef4444",
      noChangeColor: "#9aa0aa",
    },
    lines: [
      { color: "#f59e0b", size: 1, style: LineType.Solid, dashedValue: [], smooth: true },
      { color: "#38bdf8", size: 1, style: LineType.Solid, dashedValue: [], smooth: true },
      { color: "#e11d48", size: 1, style: LineType.Solid, dashedValue: [], smooth: true },
      { color: "#a855f7", size: 1, style: LineType.Solid, dashedValue: [], smooth: true },
    ],
    tooltip: {
      showRule: TooltipShowRule.FollowCross,
      showType: TooltipShowType.Standard,
      showName: true,
      showParams: true,
      defaultValue: "-",
      text: {
        color: "#cbd5e1",
        size: 11,
        family: "inherit",
        weight: 650,
        marginLeft: 8,
        marginTop: 4,
        marginRight: 8,
        marginBottom: 4,
      },
    },
  },
  xAxis: {
    show: true,
    axisLine: { show: true, color: "rgba(255,255,255,0.08)", size: 1 },
    tickLine: { show: false, color: "transparent", size: 1, length: 0 },
    tickText: {
      show: true,
      color: "#777f8d",
      family: "inherit",
      weight: 700,
      size: 11,
      marginStart: 6,
      marginEnd: 6,
    },
  },
  yAxis: {
    show: true,
    type: YAxisType.Normal,
    position: YAxisPosition.Right,
    inside: false,
    reverse: false,
    axisLine: { show: true, color: "rgba(255,255,255,0.08)", size: 1 },
    tickLine: { show: false, color: "transparent", size: 1, length: 0 },
    tickText: {
      show: true,
      color: "#9aa0aa",
      family: "inherit",
      weight: 750,
      size: 12,
      marginStart: 6,
      marginEnd: 6,
    },
  },
  separator: {
    size: 1,
    color: "rgba(255,255,255,0.07)",
    fill: true,
    activeBackgroundColor: "rgba(225,29,72,0.14)",
  },
  crosshair: {
    show: true,
    horizontal: {
      show: true,
      line: {
        show: true,
        style: LineType.Dashed,
        color: "rgba(244,245,247,0.58)",
        size: 1,
        dashedValue: [6, 6],
      },
      text: {
        show: true,
        style: PolygonType.Fill,
        color: "#f4f5f7",
        size: 12,
        family: "inherit",
        weight: 800,
        backgroundColor: "#1a1c24",
        borderColor: "rgba(255,255,255,0.12)",
        borderSize: 1,
        borderRadius: 3,
        borderStyle: LineType.Solid,
        borderDashedValue: [],
        paddingLeft: 6,
        paddingTop: 3,
        paddingRight: 6,
        paddingBottom: 3,
      },
    },
    vertical: {
      show: true,
      line: {
        show: true,
        style: LineType.Dashed,
        color: "rgba(244,245,247,0.45)",
        size: 1,
        dashedValue: [6, 6],
      },
      text: {
        show: true,
        style: PolygonType.Fill,
        color: "#f4f5f7",
        size: 12,
        family: "inherit",
        weight: 800,
        backgroundColor: "#1a1c24",
        borderColor: "rgba(255,255,255,0.12)",
        borderSize: 1,
        borderRadius: 3,
        borderStyle: LineType.Solid,
        borderDashedValue: [],
        paddingLeft: 6,
        paddingTop: 3,
        paddingRight: 6,
        paddingBottom: 3,
      },
    },
  },
  overlay: {
    point: {
      color: "#e11d48",
      borderColor: "#fff",
      borderSize: 1,
      radius: 4,
      activeColor: "#22c55e",
      activeBorderColor: "#fff",
      activeBorderSize: 1,
      activeRadius: 5,
    },
    line: {
      color: "#e11d48",
      size: 1,
      style: LineType.Solid,
      dashedValue: [],
      smooth: false,
    },
  },
};

export default function PerpChart({ price, timeframe, market }: PerpChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const candlesRef = useRef<KLineData[]>([]);
  const loadedKeyRef = useRef("");
  const [activeIndicators, setActiveIndicators] = useState<string[]>(["EMA", "VOL"]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading ratio candles…");

  const marketKey = useMemo(() => `${market}-${timeframe}`, [market, timeframe]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = init(containerRef.current, {
      timezone: "UTC",
      styles: chartStyles,
    });
    if (!chart) return;

    chart.setPriceVolumePrecision(6, 4);
    chart.setBarSpace(8);
    chart.createIndicator("EMA", false, { id: "candle_pane" });
    chart.createIndicator("VOL", false, { height: 96, dragEnabled: true });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dispose(chart);
      chartRef.current = null;
      candlesRef.current = [];
      loadedKeyRef.current = "";
    };
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const resolution = RES_PARAM[timeframe];
    const seconds = RES_SECONDS[timeframe];
    const nowSec = Math.floor(Date.now() / 1000);
    const from = nowSec - HISTORY_BARS * seconds;

    const baseSymbol = FEED_ID_TO_SYMBOL[MARKET_BASE_FEED_IDS[market]];
    const quoteSymbol = FEED_ID_TO_SYMBOL[MARKET_QUOTE_FEED_IDS[market]];

    async function load() {
      setStatus("Loading ratio candles…");
      try {
        const [base, quote] = await Promise.all([
          fetchFeedHistory(baseSymbol, resolution, from, nowSec, abort.signal),
          fetchFeedHistory(quoteSymbol, resolution, from, nowSec, abort.signal),
        ]);
        if (abort.signal.aborted) return;

        const candles = buildRatioCandles(base, quote);
        if (!candles.length) {
          const fallbackCandles = buildFallbackCandles(timeframe, price);
          candlesRef.current = fallbackCandles;
          loadedKeyRef.current = marketKey;
          applyCandles(chartRef.current, fallbackCandles);
          setStatus("Preview candles while Pyth history is empty");
          return;
        }

        candlesRef.current = candles;
        loadedKeyRef.current = marketKey;
        applyCandles(chartRef.current, candles);
        setStatus(`${candles.length} real SOL/HYPE candles`);
      } catch (error) {
        if (!abort.signal.aborted) {
          const fallbackCandles = buildFallbackCandles(timeframe, price);
          candlesRef.current = fallbackCandles;
          loadedKeyRef.current = marketKey;
          applyCandles(chartRef.current, fallbackCandles);
          setStatus("Preview candles while Pyth history loads");
          console.warn("Failed to load ratio history from Pyth Benchmarks", error);
        }
      }
    }

    load();
    return () => abort.abort();
  }, [market, marketKey, price, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !Number.isFinite(price) || price <= 0) return;
    if (loadedKeyRef.current !== marketKey) return;

    const seconds = RES_SECONDS[timeframe];
    const bucket = Math.floor(Date.now() / 1000 / seconds) * seconds * 1000;
    const candles = candlesRef.current;
    const last = candles[candles.length - 1];
    if (!last) return;

    let next: KLineData;
    if (last.timestamp === bucket) {
      next = {
        ...last,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
        close: price,
        volume: Math.max(last.volume ?? 0, Math.abs(price - last.open)),
      };
      candles[candles.length - 1] = next;
    } else if (bucket > last.timestamp) {
      next = {
        timestamp: bucket,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
        volume: Math.abs(price - last.close),
      };
      candles.push(next);
    } else {
      return;
    }

    chart.updateData(next);
  }, [marketKey, price, timeframe]);

  const toggleIndicator = useCallback((indicator: string) => {
    const chart = chartRef.current;
    if (!chart) return;

    setActiveIndicators((current) => {
      const enabled = current.includes(indicator);
      if (enabled) {
        const panes = chart.getIndicatorByPaneId();
        if (panes instanceof Map) {
          panes.forEach((paneIndicators, paneId) => {
            if (paneIndicators instanceof Map && paneIndicators.has(indicator)) {
              chart.removeIndicator(paneId, indicator);
            }
          });
        }
        return current.filter((item) => item !== indicator);
      }

      const paneOptions =
        indicator === "MA" || indicator === "EMA" || indicator === "BOLL"
          ? { id: "candle_pane" }
          : { height: indicator === "VOL" ? 96 : 120, dragEnabled: true };
      chart.createIndicator(indicator, false, paneOptions);
      return [...current, indicator];
    });
  }, []);

  const createDrawing = useCallback((name: string) => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.createOverlay(name);
    setActiveTool(name);
  }, []);

  const zoomChart = useCallback((scale: number) => {
    chartRef.current?.zoomAtCoordinate(scale, undefined, 120);
  }, []);

  const resetView = useCallback(() => {
    chartRef.current?.scrollToRealTime(120);
  }, []);

  const clearDrawings = useCallback(() => {
    chartRef.current?.removeOverlay();
    setActiveTool(null);
  }, []);

  return (
    <div className="terminal-chart-stage">
      <div className="chart-tool-strip" aria-label="Chart tools">
        <div className="chart-tool-group indicator-tools">
          {INDICATORS.map((indicator) => (
            <button
              className={activeIndicators.includes(indicator) ? "active" : ""}
              key={indicator}
              onClick={() => toggleIndicator(indicator)}
              type="button"
            >
              {indicator}
            </button>
          ))}
        </div>

        <div className="chart-tool-group drawing-tools">
          {DRAWING_TOOLS.map(({ icon: Icon, label, name }) => (
            <button
              className={activeTool === name ? "active" : ""}
              key={name}
              onClick={() => createDrawing(name)}
              title={label}
              type="button"
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
          <button onClick={clearDrawings} title="Clear drawings" type="button">
            <Trash2 size={14} />
          </button>
        </div>

        <span className="chart-data-status">{status}</span>
      </div>

      <div ref={containerRef} className="terminal-chart-canvas kline-chart-canvas" />

      <div className="chart-zoom-controls" aria-label="Chart zoom controls">
        <button aria-label="Zoom in chart" onClick={() => zoomChart(1.2)} type="button">
          <ZoomIn size={15} />
        </button>
        <button aria-label="Zoom out chart" onClick={() => zoomChart(0.82)} type="button">
          <ZoomOut size={15} />
        </button>
        <button aria-label="Return to latest candle" onClick={resetView} type="button">
          <MoveDiagonal size={15} />
        </button>
        <button aria-label="Reset chart view" onClick={resetView} type="button">
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
}
