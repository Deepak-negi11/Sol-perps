"use client";

import React, { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { ChevronDown, Wifi, X } from "lucide-react";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import { usePythPrice } from "@/hooks/usePythPrice";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import { formatAmount, formatBps, lamportsToToken } from "@/lib/format";
import { MARKET_LABELS, type MarketSymbol } from "@/lib/constants";
import AdminPanel from "./components/AdminPanel";
import PerpChart, { type ChartTimeframe } from "./components/PerpChart";
import PositionsDock from "./components/PositionsDock";
import TradeTicket from "./components/TradeTicket";
import CollateralPanel from "./components/CollateralPanel";
import OnChainActivity from "./components/OnChainActivity";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

const TIMEFRAMES: ChartTimeframe[] = ["5m", "15m", "1h"];
const DEFAULT_TRADING_FEE_BPS = 10;

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
  const [selectedMarket] = useState<MarketSymbol>("SOLHYPE");
  const [ticketWidth, setTicketWidth] = useState(360);
  const [dockHeight, setDockHeight] = useState(240);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  const { priceData, connected } = usePythPrice(selectedMarket);
  const {
    market,
    loading: marketLoading,
    error: marketError,
    refetch: refetchMarket,
  } = useMarket(selectedMarket);
  const { refetch: refetchCollateral, availableAmount } =
    useUserCollateral(selectedMarket);
  const { refetch: refetchPosition } = usePosition(selectedMarket);

  // The "price" here is the SOL/HYPE ratio (unitless), not a dollar value.
  const price = priceData?.price ?? 0;
  const displayPrice = price > 0 ? price : 0.04166;
  const openInterest = market
    ? lamportsToToken(market.openInterestLong.add(market.openInterestShort))
    : 0;
  const poolBalance = market ? lamportsToToken(market.poolBalance) : 0;
  const feeText = formatBps(
    market ? market.tradingFeesBps.toNumber() : DEFAULT_TRADING_FEE_BPS,
  );
  const marketPair = MARKET_LABELS[selectedMarket];
  const marketDash = marketPair.replace("/", "-");
  const availableBalance = lamportsToToken(availableAmount);
  const poolUtilization =
    poolBalance > 0 ? Math.min(999, (openInterest / poolBalance) * 100) : 0;
  const chartReadout = useMemo(() => {
    const range =
      timeframe === "5m" ? 0.0035 : timeframe === "15m" ? 0.0075 : 0.016;
    return {
      open: displayPrice * (1 - range * 0.45),
      high: displayPrice * (1 + range),
      low: displayPrice * (1 - range),
      close: displayPrice,
    };
  }, [displayPrice, timeframe]);
  const isProgramMissing = marketError === "Program not deployed on devnet";

  const handleUpdate = () => {
    refetchMarket();
    refetchCollateral();
    refetchPosition();
  };

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) =>
      beginPointerResize(event, "x", ticketWidth, 320, 520, setTicketWidth),
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
        <div className="terminal-nav-cluster">
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

          <nav className="terminal-nav" aria-label="Primary">
            <button className="active">Trade</button>
            <button>Positions</button>
            <button>Pool</button>
            <button>Profile</button>
          </nav>
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
            {connected ? "Oracle live" : "Connecting"}
          </span>
          <button
            className="balance-chip"
            onClick={() => setIsDepositModalOpen(true)}
          >
            {availableBalance.toFixed(2)} USDC
          </button>
          <WalletMultiButton className="wallet-btn" />
        </div>
      </header>

      <main className="terminal-main">
        <section className="market-strip" aria-label="Selected market">
          <div className="market-title">
            <button className="market-select" type="button">
              {marketDash}
              <ChevronDown size={13} />
            </button>
            <div className="market-pair">
              <span>Ratio perpetual</span>
              <strong>SOL/USD ÷ HYPE/USD</strong>
            </div>
          </div>

          <div className="market-stat-grid">
            <div>
              <span>Ratio</span>
              <strong>{displayPrice.toFixed(6)}</strong>
            </div>
            <div>
              <span>24H</span>
              <strong className="positive">+0.13%</strong>
            </div>
            <div>
              <span>Funding / HR</span>
              <strong>0.0500%</strong>
            </div>
            <div>
              <span>Open Interest</span>
              <strong>{openInterest.toFixed(0)} USDC</strong>
            </div>
            <div>
              <span>Pool Util</span>
              <strong className={poolUtilization > 75 ? "negative" : ""}>
                {poolUtilization.toFixed(1)}%
              </strong>
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

          <div className="market-pyth-prices">
            <span>{marketPair} · PYTH</span>
            <strong>
              ${priceData?.basePrice?.toFixed(2) ?? "-"} · $
              {priceData?.quotePrice?.toFixed(2) ?? "-"}
            </strong>
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
                : "Connect the admin wallet and initialize the SOL/HYPE market from the Admin Console below."}
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
          <section
            className="chart-stack"
            style={{ gridTemplateRows: `minmax(0, 1fr) ${dockHeight}px` } as React.CSSProperties}
          >
            <div className="terminal-chart-panel">
              <div className="chart-panel-title">
                <div>
                  <strong>{marketDash}</strong>
                  <span>{displayPrice.toFixed(6)}</span>
                </div>
                <em>MagicBlock ER</em>
              </div>
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
                price={displayPrice}
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

          <aside className="execution-rail">
            <TradeTicket
              market={market}
              marketSymbol={selectedMarket}
              price={displayPrice}
              marketLoading={marketLoading}
              onUpdate={handleUpdate}
            />
            <OnChainActivity market={market} marketSymbol={selectedMarket} />
          </aside>
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
