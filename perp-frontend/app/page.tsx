"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Wifi, X } from "lucide-react";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import { usePythPrice } from "@/hooks/usePythPrice";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import { formatBps, lamportsToToken } from "@/lib/format";
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

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

const TIMEFRAMES: ChartTimeframe[] = ["5m", "15m", "1h"];
const DEFAULT_MAX_LEVERAGE = 250;
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

export default function Home() {
  // This page is the terminal shell. It owns cross-component UI state such as
  // selected market, chart timeframe, remote tickers, and the resizable ticket.
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("15m");
  const [selectedMarket, setSelectedMarket] = useState<TerminalMarket>("SOL");
  const [ticketWidth, setTicketWidth] = useState(520);
  const [dockHeight, setDockHeight] = useState(240);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [tickers, setTickers] = useState<
    Partial<Record<TerminalMarket, MarketTicker>>
  >({});
  const { priceData } = usePythPrice(selectedMarket);
  const {
    market,
    loading: marketLoading,
    error: marketError,
    refetch: refetchMarket,
  } = useMarket(selectedMarket);
  const { refetch: refetchCollateral } = useUserCollateral(selectedMarket);
  const { refetch: refetchPosition } = usePosition(selectedMarket);

  // Binance ticker data is used only for public chart/readout previews. The
  // real on-chain SOL market still uses the Anchor market PDA and Pyth account.
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
  const maxLeverage = market
    ? market.maxLeverage.toNumber()
    : DEFAULT_MAX_LEVERAGE;
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

  // Any successful transaction can change several independent PDAs, so refresh
  // the market, collateral account, and position account together.
  const handleUpdate = () => {
    refetchMarket();
    refetchCollateral();
    refetchPosition();
  };

  // The resize handle sits between the chart and ticket. Dragging left makes the
  // ticket wider; the clamp keeps the terminal usable on smaller screens.
  const startResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = ticketWidth;

      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth - (moveEvent.clientX - startX);
        setTicketWidth(Math.min(700, Math.max(360, nextWidth)));
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [ticketWidth],
  );

  const startVerticalResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = dockHeight;

      const handleMove = (moveEvent: PointerEvent) => {
        const nextHeight = startHeight - (moveEvent.clientY - startY);
        setDockHeight(Math.min(700, Math.max(80, nextHeight)));
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
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
          <span className="network-chip">
            <Wifi size={14} />
            Devnet
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
        {/* Top market strip mixes off-chain ticker data with on-chain market
            config so the user can see both price and protocol state. */}
        <section className="market-strip" aria-label="Selected market" style={{ gridTemplateColumns: "1fr" }}>
          <div className="market-stat-grid">
            <div>
              <span>Mark Price</span>
              <strong>${formatUsd(price)}</strong>
            </div>
            <div>
              <span>Oracle Conf</span>
              <strong>
                ±${formatUsd(confidence)}
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

        {/* Main terminal layout: market rail, chart/dock stack, resize handle,
            and the trading ticket. */}
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
                    O {formatUsd(chartReadout.open)} H{" "}
                    {formatUsd(chartReadout.high)} L{" "}
                    {formatUsd(chartReadout.low)} C{" "}
                    {formatUsd(chartReadout.close)}
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
