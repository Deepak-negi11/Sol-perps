"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Wifi, X } from "lucide-react";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import { usePythPrice } from "@/hooks/usePythPrice";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import { formatAmount, formatBps, lamportsToToken } from "@/lib/format";
import MarketRail, { type TerminalMarket } from "./components/MarketRail";
import AdminPanel from "./components/AdminPanel";
import PerpChart, { type ChartTimeframe } from "./components/PerpChart";
import PositionsDock from "./components/PositionsDock";
import TradeTicket from "./components/TradeTicket";
import CollateralPanel from "./components/CollateralPanel";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

const TIMEFRAMES: ChartTimeframe[] = ["5m", "15m", "1h"];
const DEFAULT_TRADING_FEE_BPS = 10;
const MARKET_TO_BINANCE_SYMBOL: Record<TerminalMarket, string> = {
  SOL: "SOLUSDC",
  ETH: "ETHUSDC",
  WBTC: "BTCUSDC",
};

interface MarketTicker {
  lastPrice: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
}

function beginPointerResize(
  event: React.PointerEvent,
  axis: "x" | "y",
  startValue: number,
  min: number,
  max: number,
  onResize: (value: number) => void,
) {
  event.preventDefault();
  const startPointer = axis === "x" ? event.clientX : event.clientY;

  const handleMove = (moveEvent: PointerEvent) => {
    const pointer = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
    const next = startValue - (pointer - startPointer);
    onResize(Math.min(max, Math.max(min, next)));
  };

  const handleUp = () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
  };

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
}

export default function Home() {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("15m");
  const [selectedMarket, setSelectedMarket] = useState<TerminalMarket>("SOL");
  const [ticketWidth, setTicketWidth] = useState(520);
  const [dockHeight, setDockHeight] = useState(240);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [tickers, setTickers] = useState<
    Partial<Record<TerminalMarket, MarketTicker>>
  >({});

  const { priceData, connected } = usePythPrice(selectedMarket);
  const {
    market,
    loading: marketLoading,
    error: marketError,
    refetch: refetchMarket,
  } = useMarket(selectedMarket);
  const { refetch: refetchCollateral } = useUserCollateral(selectedMarket);
  const { refetch: refetchPosition } = usePosition(selectedMarket);

  useEffect(() => {
    const abort = new AbortController();

    async function fetchTickers() {
      try {
        const entries = await Promise.all(
          (
            Object.entries(MARKET_TO_BINANCE_SYMBOL) as Array<
              [TerminalMarket, string]
            >
          ).map(async ([marketKey, symbol]) => {
            const response = await fetch(
              `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
              { signal: abort.signal },
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            return [
              marketKey,
              {
                lastPrice: Number(json.lastPrice),
                priceChangePercent: Number(json.priceChangePercent),
                volume: Number(json.volume),
                quoteVolume: Number(json.quoteVolume),
              },
            ] as const;
          }),
        );
        setTickers(Object.fromEntries(entries));
      } catch (error) {
        if (!abort.signal.aborted) {
          console.warn("Ticker fallback active", error);
          setTickers({});
        }
      }
    }

    fetchTickers();
    const interval = setInterval(fetchTickers, 10_000);
    return () => {
      abort.abort();
      clearInterval(interval);
    };
  }, []);

  const ticker = tickers[selectedMarket] ?? null;
  const price = priceData?.price ?? ticker?.lastPrice ?? 75;
  const openInterest = market
    ? lamportsToToken(market.openInterestLong.add(market.openInterestShort))
    : 0;
  const poolBalance = market ? lamportsToToken(market.poolBalance) : 0;
  const feeText = formatBps(
    market ? market.tradingFeesBps.toNumber() : DEFAULT_TRADING_FEE_BPS,
  );
  const confidence = priceData?.confidence ?? 0;
  const marketPair = `${selectedMarket}/USDC`;
  const chartReadout = useMemo(() => {
    const range =
      timeframe === "5m" ? 0.0035 : timeframe === "15m" ? 0.0075 : 0.016;
    return {
      open: price * (1 - range * 0.45),
      high: price * (1 + range),
      low: price * (1 - range),
      close: price,
    };
  }, [price, timeframe]);
  const isProgramMissing = marketError === "Program not deployed on devnet";

  const handleUpdate = () => {
    refetchMarket();
    refetchCollateral();
    refetchPosition();
  };

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) =>
      beginPointerResize(event, "x", ticketWidth, 360, 700, setTicketWidth),
    [ticketWidth],
  );

  const startVerticalResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) =>
      beginPointerResize(event, "y", dockHeight, 80, 700, setDockHeight),
    [dockHeight],
  );

  return (
    <div className="perp-shell">
      <header className="terminal-topnav">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Image
              src="/satr-planet-header.png"
              alt=""
              width={736}
              height={552}
              priority
            />
          </div>
          <strong>Satr</strong>
        </div>

        <div className="terminal-actions">
          <span
            className="network-chip"
            style={{
              color: connected
                ? "var(--long-green)"
                : "var(--warning-amber)",
            }}
          >
            <Wifi size={14} />
            {connected ? "Oracle live" : "Connecting…"}
          </span>
          <button
            className="deposit-btn-header"
            onClick={() => setIsDepositModalOpen(true)}
          >
            Deposit
          </button>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="terminal-main">
        <section className="market-strip" aria-label="Selected market" style={{ gridTemplateColumns: "1fr" }}>
          <div className="market-stat-grid">
            <div>
              <span>Mark Price</span>
              <strong>${formatAmount(price)}</strong>
            </div>
            <div>
              <span>Oracle Conf</span>
              <strong>
                ±${formatAmount(confidence)}
              </strong>
            </div>
            <div>
              <span>24H Change</span>
              <strong
                className={
                  (ticker?.priceChangePercent ?? 0) < 0 ? "negative" : ""
                }
              >
                {ticker ? `${ticker.priceChangePercent.toFixed(2)}%` : "-"}
              </strong>
            </div>
            <div>
              <span>24H Volume</span>
              <strong>
                {ticker
                  ? `$${(ticker.quoteVolume / 1_000_000).toFixed(2)}M`
                  : "-"}
              </strong>
            </div>
            <div>
              <span>Open Interest</span>
              <strong>{openInterest.toFixed(2)} USDC</strong>
            </div>
            <div>
              <span>Trading Fee</span>
              <strong>{feeText}</strong>
            </div>
            <div>
              <span>Pool Balance</span>
              <strong>{poolBalance.toFixed(2)} USDC</strong>
            </div>
          </div>
        </section>

        {marketError ? (
          <div className="terminal-alert setup-alert">
            <span>
              {isProgramMissing
                ? "Program deployment required"
                : "Market setup required"}
            </span>
            <strong>
              {isProgramMissing
                ? "Deploy the Anchor program to devnet or update the frontend PROGRAM_ID to the deployed program."
                : "Connect the admin wallet and initialize from Admin Console below."}
            </strong>
          </div>
        ) : null}

        {!market && !isProgramMissing ? (
          <div className="setup-inline-panel">
            <AdminPanel
              market={market}
              marketSymbol={selectedMarket}
              loading={marketLoading}
              onUpdate={handleUpdate}
            />
          </div>
        ) : null}

        <div
          className="terminal-workspace"
          style={
            { "--ticket-width": `${ticketWidth}px` } as React.CSSProperties
          }
        >
          <MarketRail
            selectedMarket={selectedMarket}
            onSelectMarket={setSelectedMarket}
            tickers={tickers}
          />

          <section
            className="chart-stack"
            style={{ gridTemplateRows: `minmax(0, 1fr) ${dockHeight}px` } as React.CSSProperties}
          >
            <div className="terminal-chart-panel">
              <div className="chart-toolbar">
                <div className="timeframe-row">
                  {TIMEFRAMES.map((item) => (
                    <button
                      className={item === timeframe ? "active" : ""}
                      key={item}
                      onClick={() => setTimeframe(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="chart-readout">
                  <span>
                    {marketPair} · {timeframe} · Satr
                  </span>
                  <strong>
                    O {formatAmount(chartReadout.open)} H{" "}
                    {formatAmount(chartReadout.high)} L{" "}
                    {formatAmount(chartReadout.low)} C{" "}
                    {formatAmount(chartReadout.close)}
                  </strong>
                </div>
              </div>
              <PerpChart
                price={price}
                timeframe={timeframe}
                market={selectedMarket}
              />
            </div>

            <div className="dock-wrapper" style={{ position: "relative", height: "100%", minHeight: 0 }}>
              <button
                className="dock-resize-handle"
                onPointerDown={startVerticalResize}
                onDoubleClick={() => setDockHeight(dockHeight === 600 ? 240 : 600)}
                aria-label="Resize dock"
              />
              {market ? (
                <PositionsDock
                  market={market}
                  marketSymbol={selectedMarket}
                  onUpdate={handleUpdate}
                />
              ) : (
                <section className="positions-dock setup-dock-placeholder">
                  <div className="dock-empty">
                    Initialize the market above, then positions and orders will
                    appear here.
                  </div>
                </section>
              )}
            </div>
          </section>

          <button
            className="ticket-resize-handle"
            aria-label="Resize trading panel"
            onPointerDown={startResize}
          />

          <TradeTicket
            market={market}
            marketSymbol={selectedMarket}
            price={price}
            marketLoading={marketLoading}
            onUpdate={handleUpdate}
          />
        </div>
      </main>

      {isDepositModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsDepositModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Collateral</h3>
              <button
                className="modal-close-btn"
                onClick={() => setIsDepositModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
            <CollateralPanel
              market={market}
              marketSymbol={selectedMarket}
              onUpdate={handleUpdate}
                onDepositSuccess={() => setIsDepositModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
