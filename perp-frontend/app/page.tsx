"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { ChevronDown, Copy, LogOut } from "lucide-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import { usePythPrice } from "@/hooks/usePythPrice";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import {
  formatAmount,
  formatBps,
  lamportsToToken,
  shortenAddress,
} from "@/lib/format";
import { MARKET_LABELS, type MarketSymbol } from "@/lib/constants";
import AdminPanel from "./components/AdminPanel";
import PerpChart, { type ChartTimeframe } from "./components/PerpChart";
import PositionsDock from "./components/PositionsDock";
import TradeTicket from "./components/TradeTicket";
import OnChainActivity from "./components/OnChainActivity";
import {
  PoolPage,
  PositionsPage,
  ProfilePage,
} from "./components/NyxoraPages";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

const TIMEFRAMES: ChartTimeframe[] = ["5m", "15m", "1h"];
const DEFAULT_TRADING_FEE_BPS = 10;
const CONFIGURED_ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET?.trim();
type AppView = "trade" | "positions" | "pool" | "profile";
const NAV_ITEMS: { id: AppView; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "positions", label: "Positions" },
  { id: "pool", label: "Pool" },
  { id: "profile", label: "Profile" },
];

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
  const [activeView, setActiveView] = useState<AppView>("trade");
  const [ticketWidth, setTicketWidth] = useState(360);
  const [dockHeight, setDockHeight] = useState(240);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [solBalance, setSolBalance] = useState(0);

  const { connection } = useConnection();
  const { publicKey, disconnect } = useWallet();
  const { priceData } = usePythPrice(selectedMarket);
  const {
    market,
    loading: marketLoading,
    error: marketError,
    refetch: refetchMarket,
  } = useMarket(selectedMarket);
  const { refetch: refetchCollateral, availableAmount } =
    useUserCollateral(selectedMarket);
  const { positions, refetch: refetchPosition } = usePosition(selectedMarket);
  const { history, refetch: refetchHistory } = useTradeHistory();

  
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
  const isConfiguredAdmin =
    Boolean(CONFIGURED_ADMIN_WALLET) &&
    publicKey?.toBase58() === CONFIGURED_ADMIN_WALLET;
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

  useEffect(() => {
    if (!publicKey) return;

    let cancelled = false;
    connection
      .getBalance(publicKey, "confirmed")
      .then((lamports) => {
        if (!cancelled) setSolBalance(lamports / LAMPORTS_PER_SOL);
      })
      .catch(() => {
        if (!cancelled) setSolBalance(0);
      });

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  const handleUpdate = () => {
    refetchMarket();
    refetchCollateral();
    refetchPosition();
    refetchHistory();
  };

  const handleCopyAddress = async () => {
    if (!publicKey) return;
    await navigator.clipboard?.writeText(publicKey.toBase58());
    setIsAccountMenuOpen(false);
  };

  const handleDisconnect = async () => {
    setIsAccountMenuOpen(false);
    await disconnect();
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
                src="/nyxora-star-logo.jpg"
                alt="Nyxora"
                width={1024}
                height={1024}
                priority
              />
            </div>
            <strong>Nyxora</strong>
          </div>

          <nav className="terminal-nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={activeView === item.id ? "active" : ""}
                onClick={() => setActiveView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="terminal-actions">
          {publicKey ? (
            <div className="account-menu-wrap">
              <button
                className="balance-chip account-trigger"
                onClick={() => setIsAccountMenuOpen((open) => !open)}
              >
                <span className="wallet-status-dot" />
                {availableBalance.toFixed(2)} USDC
                <span className="trigger-divider" />
                {shortenAddress(publicKey.toBase58(), 4)}
                <ChevronDown size={13} />
              </button>
              {isAccountMenuOpen ? (
                <div className="account-dropdown">
                  <div className="account-dropdown-head">
                    <span>ON-CHAIN · DEVNET</span>
                    <div className="account-logo">
                      <Image
                        src="/nyxora-star-logo.jpg"
                        alt=""
                        width={1024}
                        height={1024}
                      />
                    </div>
                  </div>
                  <div className="account-dropdown-row">
                    <span>USDC</span>
                    <strong>{availableBalance.toFixed(2)}</strong>
                  </div>
                  <div className="account-dropdown-row">
                    <span>SOL</span>
                    <strong>{solBalance.toFixed(4)}</strong>
                  </div>
                  <button
                    className="account-dropdown-action"
                    onClick={handleCopyAddress}
                  >
                    <Copy size={16} />
                    Copy address
                  </button>
                  <button
                    className="account-dropdown-action disconnect-action"
                    onClick={handleDisconnect}
                  >
                    <LogOut size={16} />
                    Disconnect
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <WalletMultiButton className="wallet-btn" />
          )}
        </div>
      </header>

      <main className="terminal-main">
        {activeView === "trade" ? (
          <>
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
                : isConfiguredAdmin
                  ? "Initialize the SOL/HYPE market from the admin setup panel below."
                  : "The SOL/HYPE market is not initialized yet. Ask the configured admin wallet to initialize it."}
            </strong>
          </div>
        ) : null}

        {!market && !isProgramMissing && isConfiguredAdmin ? (
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
                    {marketPair} · {timeframe} · Nyxora
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
          </>
        ) : activeView === "positions" ? (
          <PositionsPage
            market={market}
            marketSymbol={selectedMarket}
            positions={positions}
            history={history}
            publicKey={publicKey}
            price={displayPrice}
            openInterest={openInterest}
            poolBalance={poolBalance}
            availableBalance={availableBalance}
            poolUtilization={poolUtilization}
            onTrade={() => setActiveView("trade")}
          />
        ) : activeView === "pool" ? (
          <PoolPage
            market={market}
            marketSymbol={selectedMarket}
            positions={positions}
            history={history}
            publicKey={publicKey}
            price={displayPrice}
            openInterest={openInterest}
            poolBalance={poolBalance}
            availableBalance={availableBalance}
            poolUtilization={poolUtilization}
            onTrade={() => setActiveView("trade")}
          />
        ) : (
          <ProfilePage
            market={market}
            marketSymbol={selectedMarket}
            positions={positions}
            history={history}
            publicKey={publicKey}
            price={displayPrice}
            openInterest={openInterest}
            poolBalance={poolBalance}
            availableBalance={availableBalance}
            poolUtilization={poolUtilization}
            onTrade={() => setActiveView("trade")}
          />
        )}
      </main>
    </div>
  );
}
