"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  Database,
  ExternalLink,
  Layers,
  RefreshCcw,
  Shield,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { PublicKey } from "@solana/web3.js";
import type { MarketData } from "@/hooks/useMarket";
import type { PositionData } from "@/hooks/usePosition";
import type { TradeHistoryItem } from "@/hooks/useTradeHistory";
import { MARKET_LABELS, type MarketSymbol } from "@/lib/constants";
import { formatUsd, lamportsToToken, tokenToLamports, shortenAddress } from "@/lib/format";
import { useProgram } from "@/hooks/useProgram";
import { useToast } from "./Toast";
import { getMarketPda, getVaultAuthorityPda } from "@/lib/pda";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

interface SharedPageProps {
  market: MarketData | null;
  marketSymbol: MarketSymbol;
  positions: PositionData[];
  history: TradeHistoryItem[];
  publicKey: PublicKey | null;
  price: number;
  openInterest: number;
  poolBalance: number;
  availableBalance: number;
  poolUtilization: number;
  onTrade: () => void;
  onUpdate?: () => void;
}

const FOOTER_PRODUCT_LINKS = ["Trade", "Pool"];
const FOOTER_COPY =
  "Ratio perpetuals on Solana devnet. One pool, one margin engine, live oracle settlement.";
const TWITTER_HANDLE = "@depx_____";
const TWITTER_URL = "https://x.com/depx_____";

function NyxoraFooter() {
  return (
    <footer className="nyx-footer">
      <div className="nyx-footer-brand">
        <strong>Nyxora</strong>
        <span>{FOOTER_COPY}</span>
      </div>
      <div>
        <strong>Product</strong>
        {FOOTER_PRODUCT_LINKS.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div>
        <strong>Connect</strong>
        <a href={TWITTER_URL} target="_blank" rel="noreferrer">
          {TWITTER_HANDLE}
        </a>
      </div>
    </footer>
  );
}

function explorerTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function explorerAddress(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function computePositionRows(
  positions: PositionData[],
  price: number,
  market: MarketData | null,
) {
  return positions.map((position) => {
    const isLong = "long" in position.side;
    const entryPrice = lamportsToToken(position.entryPrice);
    const size = lamportsToToken(position.positionSize);
    const collateral = lamportsToToken(position.collateral);
    const leverage = position.leverage.toNumber();
    const priceDiff = Math.abs(price - entryPrice);
    const rawPnl = entryPrice > 0 ? (size * priceDiff) / entryPrice : 0;
    const isProfitable = isLong ? price >= entryPrice : price <= entryPrice;
    const pnl = isProfitable ? rawPnl : -rawPnl;
    const maintenanceMargin = market
      ? market.liquidationThresholdBps.toNumber() / 10_000
      : 0.05;
    const liquidationMove =
      leverage > 0 ? Math.max(0, 1 / leverage - maintenanceMargin) : 0;
    const liquidationPrice = isLong
      ? entryPrice * (1 - liquidationMove)
      : entryPrice * (1 + liquidationMove);

    return {
      id: position.publicKey.toString(),
      side: isLong ? "LONG" : "SHORT",
      isLong,
      entryPrice,
      markPrice: price,
      size,
      collateral,
      leverage,
      pnl,
      pnlPercent: collateral > 0 ? (pnl / collateral) * 100 : 0,
      liquidationPrice,
      slot: position.positionId.toString(),
    };
  });
}

export function PositionsPage(props: SharedPageProps) {
  const marketPair = MARKET_LABELS[props.marketSymbol];
  const rows = useMemo(
    () => computePositionRows(props.positions, props.price, props.market),
    [props.market, props.positions, props.price],
  );

  return (
    <div className="nyx-page-shell">
      <section className="nyx-page">
        <div className="nyx-hero">
          <span>Portfolio</span>
          <h1>Positions</h1>
          <p>
            Isolated margin positions settled against the Nyxora pool, with live
            mark price and liquidation levels.
          </p>
          <button className="nyx-ghost-btn" onClick={props.onTrade}>
            Trade <ArrowRight size={14} />
          </button>
        </div>

        <div className="nyx-section-head">
          <strong>{rows.length} open position{rows.length === 1 ? "" : "s"}</strong>
          <span>{marketPair} market</span>
        </div>

        <div className="nyx-position-list">
          {props.publicKey && rows.length ? (
            rows.map((row) => (
              <article className="nyx-position-card" key={row.id}>
                <header>
                  <div>
                    <span className={`nyx-side ${row.isLong ? "long" : "short"}`}>
                      {row.side}
                    </span>
                    <strong>{marketPair.replace("/", "-")}</strong>
                    <em>{row.leverage}x</em>
                  </div>
                  <a href={explorerAddress(row.id)} target="_blank" rel="noreferrer">
                    on-chain <ExternalLink size={12} />
                  </a>
                </header>
                <div className="nyx-position-metrics">
                  <div>
                    <span>Live equity</span>
                    <strong className={row.pnl >= 0 ? "positive" : "negative"}>
                      {formatUsd(row.collateral + row.pnl)}
                    </strong>
                    <em className={row.pnl >= 0 ? "positive" : "negative"}>
                      {row.pnl >= 0 ? "+" : ""}
                      {formatUsd(row.pnl)} ({row.pnlPercent.toFixed(2)}%)
                    </em>
                  </div>
                  <div>
                    <span>Notional</span>
                    <strong>{formatUsd(row.size)}</strong>
                    <em>collateral {formatUsd(row.collateral)}</em>
                  </div>
                  <div>
                    <span>Entry / mark</span>
                    <strong>{formatUsd(row.entryPrice)}</strong>
                    <em>now {formatUsd(row.markPrice)}</em>
                  </div>
                  <div>
                    <span>Liquidation</span>
                    <strong>{formatUsd(row.liquidationPrice)}</strong>
                    <em>slot {row.slot}</em>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="nyx-empty-panel">
              {props.publicKey
                ? "No open positions yet."
                : "Connect your wallet to view positions."}
            </div>
          )}
        </div>
      </section>
      <NyxoraFooter />
    </div>
  );
}

export function PoolPage(props: SharedPageProps) {
  const marketPair = MARKET_LABELS[props.marketSymbol];
  const navPerShare =
    props.poolBalance > 0
      ? props.poolBalance / Math.max(1, props.poolBalance - props.openInterest * 0.001)
      : 1;
  const totalFees = props.market
    ? lamportsToToken(props.market.totalTradingFeesCollected)
    : 0;

  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [submitting, setSubmitting] = useState(false);
  const program = useProgram();
  const { addToast } = useToast();

  const isAdmin =
    props.market &&
    props.publicKey &&
    props.market.admin.toString() === props.publicKey.toString();

  const userShares = isAdmin ? props.poolBalance : 0;
  const userValue = isAdmin ? props.poolBalance : 0;
  const userSharePct = isAdmin ? "100.00%" : "0.00%";

  const handleLiquidity = async () => {
    if (!program || !props.market || !props.publicKey || !amount) return;
    setSubmitting(true);
    try {
      const lamports = tokenToLamports(parseFloat(amount));
      const marketPda = getMarketPda(props.marketSymbol);
      const vaultAuthority = getVaultAuthorityPda();
      const vaultTokenAccount = await getAssociatedTokenAddress(
        props.market.collateralMint,
        vaultAuthority,
        true
      );
      const adminTokenAccount = await getAssociatedTokenAddress(
        props.market.collateralMint,
        props.publicKey
      );

      addToast(
        tab === "deposit" ? "Adding pool liquidity..." : "Removing pool liquidity...",
        "info"
      );

      const txBuilder =
        tab === "deposit"
          ? program.methods.addLiquidity(lamports).accounts({
            market: marketPda,
            vaultAuthority,
            collateralMint: props.market.collateralMint,
            adminTokenAccount,
            vaultTokenAccount,
            admin: props.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          : program.methods.removeLiquidity(lamports).accounts({
            market: marketPda,
            vaultAuthority,
            collateralMint: props.market.collateralMint,
            vaultTokenAccount,
            adminTokenAccount,
            admin: props.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          });

      const signature = await txBuilder.rpc();
      addToast(
        tab === "deposit" ? "Liquidity added successfully!" : "Liquidity removed successfully!",
        "success",
        signature
      );
      setAmount("");
      props.onUpdate?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`Liquidity action failed: ${message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="nyx-page-shell">
      <section className="nyx-page">
        <div className="nyx-hero pool">
          <span>Liquidity</span>
          <h1>Liquidity pool</h1>
          <p>
            The live {marketPair} counterparty pool. Deposits and withdrawals
            are real devnet transactions, and traders settle PnL against this
            vault.
          </p>
          <button className="nyx-ghost-btn" onClick={props.onTrade}>
            <RefreshCcw size={14} /> Back to trade
          </button>
        </div>

        <div className="nyx-chip-row">
          <span><Database size={13} /> devnet</span>
          <span>pool on ER</span>
          <span>{marketPair.replace("/", "-")}</span>
        </div>

        <div className="nyx-metric-grid">
          <div className="nyx-metric-card">
            <Layers size={15} />
            <span>Pool AUM</span>
            <strong>{formatUsd(props.poolBalance)}</strong>
            <em>{props.poolBalance.toFixed(2)} USDC</em>
          </div>
          <div className="nyx-metric-card">
            <TrendingUp size={15} />
            <span>NAV / share</span>
            <strong>{navPerShare.toFixed(4)}</strong>
            <em>USDC per share</em>
          </div>
          <div className="nyx-metric-card">
            <Shield size={15} />
            <span>Net-OI utilization</span>
            <strong className={props.poolUtilization > 75 ? "negative" : ""}>
              {props.poolUtilization.toFixed(1)}%
            </strong>
            <em>OI {formatUsd(props.openInterest)}</em>
          </div>
          <div className="nyx-metric-card">
            <WalletCards size={15} />
            <span>Protocol fees</span>
            <strong>{formatUsd(totalFees)}</strong>
            <em>collected in pool</em>
          </div>
        </div>

        <div className="nyx-pool-grid">
          <article className="nyx-page-card">
            <h2>Your position</h2>
            <div className="nyx-inline-stats">
              <div>
                <span>Your shares</span>
                <strong>{userShares.toFixed(2)}</strong>
              </div>
              <div>
                <span>Value</span>
                <strong>{formatUsd(userValue)}</strong>
              </div>
              <div>
                <span>Pool share</span>
                <strong>{userSharePct}</strong>
              </div>
            </div>
            <div className="nyx-detail-box">
              <span>Accrued fees (pool)</span>
              <strong>{formatUsd(totalFees)}</strong>
              <span>Collateral mint</span>
              <strong>{props.market?.collateralMint.toBase58().slice(0, 5) ?? "--"}...</strong>
              <span>Your collateral balance</span>
              <strong>{formatUsd(props.availableBalance)}</strong>
            </div>
          </article>

          <article className="nyx-page-card nyx-liquidity-form">
            <div className="nyx-tabs">
              <button
                className={tab === "deposit" ? "active" : ""}
                onClick={() => setTab("deposit")}
              >
                Deposit
              </button>
              <button
                className={tab === "withdraw" ? "active" : ""}
                onClick={() => setTab("withdraw")}
              >
                Withdraw
              </button>
            </div>
            <label>
              Amount (USDC)
              <input
                type="number"
                placeholder="0.00"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </label>
            <div className="nyx-detail-box small">
              <span>Shares minted</span>
              <strong>{amount ? parseFloat(amount).toFixed(2) : "0.00"}</strong>
              <span>NAV / share</span>
              <strong>{navPerShare.toFixed(4)}</strong>
            </div>
            <button
              className="nyx-danger-btn"
              onClick={handleLiquidity}
              disabled={
                submitting ||
                !amount ||
                parseFloat(amount) <= 0 ||
                !props.publicKey ||
                !isAdmin
              }
            >
              {submitting
                ? "Processing..."
                : !props.publicKey
                  ? "Wallet not connected"
                  : !isAdmin
                    ? "Admin signature required"
                    : tab === "deposit"
                      ? "Deposit liquidity"
                      : "Withdraw liquidity"}
            </button>
          </article>
        </div>
      </section>
      <NyxoraFooter />
    </div>
  );
}

export function ProfilePage(props: SharedPageProps) {
  const address = props.publicKey?.toBase58();
  const rows = useMemo(
    () => computePositionRows(props.positions, props.price, props.market),
    [props.market, props.positions, props.price],
  );
  const liveEquity = rows.reduce((sum, row) => sum + row.collateral + row.pnl, 0);
  const realizedPnl = props.history.reduce((sum, item) => sum + (item.pnl ?? 0), 0);
  const volume = props.history.reduce((sum, item) => sum + (item.size ?? 0), 0);
  const wins = props.history.filter((item) => (item.pnl ?? 0) > 0).length;
  const closed = props.history.filter((item) => item.pnl !== null).length;
  const liquidations = props.history.filter(
    (item) => item.action === "Liquidated",
  ).length;

  return (
    <div className="nyx-page-shell">
      <section className="nyx-page">
        <div className="nyx-profile-hero">
          <div className="nyx-avatar">N</div>
          <div>
            <strong>{address ? shortenAddress(address, 6) : "Wallet not connected"}</strong>
            <span>Solana devnet</span>
            <span>trading live</span>
          </div>
          <aside>
            <span>Account value</span>
            <strong>{formatUsd(props.availableBalance + liveEquity)}</strong>
          </aside>
        </div>

        <div className="nyx-metric-grid profile">
          <div className="nyx-metric-card">
            <span>Wallet balance</span>
            <strong>{formatUsd(props.availableBalance)}</strong>
            <em>USDC (devnet)</em>
          </div>
          <div className="nyx-metric-card highlight">
            <span>Free collateral</span>
            <strong>{formatUsd(props.availableBalance)}</strong>
            <em>deposited, unlocked</em>
          </div>
          <div className="nyx-metric-card">
            <span>Open positions</span>
            <strong className="positive">{formatUsd(liveEquity)}</strong>
            <em>{rows.length} open</em>
          </div>
          <div className="nyx-metric-card">
            <span>LP value</span>
            <strong>{formatUsd(0)}</strong>
            <em>0.00 shares</em>
          </div>
        </div>

        <div className="nyx-section-head accent">
          <strong>Performance</strong>
        </div>
        <div className="nyx-performance-grid">
          <div><span>Trades</span><strong>{props.history.length}</strong></div>
          <div><span>Win rate</span><strong>{closed ? `${((wins / closed) * 100).toFixed(0)}%` : "0%"}</strong></div>
          <div><span>Realized PnL</span><strong>{formatUsd(realizedPnl)}</strong></div>
          <div><span>Volume</span><strong>{formatUsd(volume)}</strong></div>
          <div><span>Avg / trade</span><strong>{formatUsd(closed ? volume / closed : 0)}</strong></div>
          <div><span>Liquidations</span><strong>{liquidations}</strong></div>
        </div>

        <div className="nyx-section-head accent">
          <strong>Recent activity</strong>
        </div>
        <div className="nyx-activity-list">
          {props.history.slice(0, 4).map((item) => (
            <a href={explorerTx(item.signature)} key={item.id} target="_blank" rel="noreferrer">
              <span>{item.action.toLowerCase()} {item.isLong ? "long" : "short"} {item.marketSymbol}</span>
              <strong>{item.size ? formatUsd(item.size) : "-"}</strong>
              <em>{item.signature.slice(0, 5)}...{item.signature.slice(-4)}</em>
            </a>
          ))}
          {!props.history.length ? (
            <div className="nyx-empty-panel">No trades yet. Close a position and it will be recorded here.</div>
          ) : null}
        </div>

        <div className="nyx-section-head accent with-action">
          <strong>Trade history</strong>
          <button className="nyx-ghost-btn" onClick={props.onTrade}>
            New trade <ArrowRight size={14} />
          </button>
        </div>
        <div className="nyx-empty-panel trade-history-panel">
          {props.history.length
            ? `${props.history.length} parsed on-chain trade event${props.history.length === 1 ? "" : "s"}.`
            : "No trades yet. Close a position and it will be recorded here with its realized PnL."}
        </div>
      </section>
      <NyxoraFooter />
    </div>
  );
}
