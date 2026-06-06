"use client";

import React, { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "@/hooks/useProgram";
import { usePosition } from "@/hooks/usePosition";
import { usePythPrice } from "@/hooks/usePythPrice";
import { useToast } from "./Toast";
import { MarketData } from "@/hooks/useMarket";
import { lamportsToToken, formatUsd } from "@/lib/format";
import { getMarketPda, getPythPriceUpdatePda } from "@/lib/pda";
import HealthBar from "./HealthBar";
import { BN } from "@coral-xyz/anchor";

interface PositionCardProps {
  market: MarketData | null;
  onUpdate: () => void;
}

export default function PositionCard({ market, onUpdate }: PositionCardProps) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const { position, refetch } = usePosition();
  const { priceData } = usePythPrice();
  const { addToast } = useToast();
  const [closing, setClosing] = useState(false);

  // Compute live values if there's an open position
  const computed = useMemo(() => {
    if (!position || !position.isOpen || !priceData) return null;

    const entryPrice = position.entryPrice;
    const currentPrice = new BN(Math.floor(priceData.price * 1_000_000));

    let priceDiff = new BN(0);
    let isLoss = false;
    const isLong = "long" in position.side;

    if (isLong) {
      if (currentPrice.gte(entryPrice)) {
        priceDiff = currentPrice.sub(entryPrice);
      } else {
        priceDiff = entryPrice.sub(currentPrice);
        isLoss = true;
      }
    } else {
      if (entryPrice.gte(currentPrice)) {
        priceDiff = entryPrice.sub(currentPrice);
      } else {
        priceDiff = currentPrice.sub(entryPrice);
        isLoss = true;
      }
    }

    // pnl = size * priceDiff / entryPrice
    const pnl = position.positionSize.mul(priceDiff).div(entryPrice);
    const signedPnl = isLoss ? pnl.neg() : pnl;

    // remaining_collateral
    let remainingCollateral = new BN(0);
    if (isLoss) {
      if (pnl.lt(position.collateral)) {
        remainingCollateral = position.collateral.sub(pnl);
      }
    } else {
      remainingCollateral = position.collateral.add(pnl);
    }

    // required_margin = positionSize * thresholdBps / 10000
    const thresholdBps = market ? market.liquidationThresholdBps : new BN(500);
    const requiredMargin = position.positionSize
      .mul(thresholdBps)
      .div(new BN(10000));

    return {
      isLong,
      entryPrice: lamportsToToken(entryPrice),
      currentPrice: priceData.price,
      size: lamportsToToken(position.positionSize),
      collateral: lamportsToToken(position.collateral),
      leverage: position.leverage.toString(),
      pnl: lamportsToToken(signedPnl),
      remainingCollateral,
      requiredMargin,
      pnlPercent:
        (lamportsToToken(signedPnl) / lamportsToToken(position.collateral)) *
        100,
    };
  }, [position, priceData, market]);

  if (!publicKey) {
    return (
      <div className="glass-card card-body">
        <div className="section-header">
          <span className="section-title">Active Position</span>
        </div>
        <div className="empty-state">
          <div className="icon">📊</div>
          <div className="message">Connect wallet to view active position</div>
        </div>
      </div>
    );
  }

  if (!position || !position.isOpen) {
    return (
      <div className="glass-card card-body">
        <div className="section-header">
          <span className="section-title">Active Position</span>
        </div>
        <div className="empty-state">
          <div className="icon">📊</div>
          <div className="message">No active positions open</div>
        </div>
      </div>
    );
  }

  const handleClosePosition = async () => {
    if (!program || !market) return;
    setClosing(true);
    try {
      addToast("Closing position...", "info");
      const marketPda = getMarketPda();
      const priceUpdatePda = getPythPriceUpdatePda(market.priceFeedId);

      const sig = await program.methods
        .closePosition()
        .accounts({
          market: marketPda,
          priceUpdate: priceUpdatePda,
          user: publicKey,
        })
        .rpc();

      addToast("Position closed successfully!", "success", sig);
      await refetch();
      onUpdate();
    } catch (e: unknown) {
      addToast(
        `Failed to close position: ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="glass-card card-body">
      <div className="section-header">
        <span className="section-title">Active Position</span>
        <span
          className={`section-badge ${computed?.isLong ? "badge-active" : "badge-paused"}`}
          style={{
            background: computed?.isLong
              ? "var(--long-green-dim)"
              : "var(--short-red-dim)",
            color: computed?.isLong ? "var(--long-green)" : "var(--short-red)",
            fontWeight: 700,
          }}
        >
          {computed?.isLong ? "LONG" : "SHORT"} {computed?.leverage}X
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            Position Size
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>
            {computed ? `${computed.size.toFixed(2)} USD` : "Loading..."}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            Unrealized PnL
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              color:
                computed && computed.pnl >= 0
                  ? "var(--long-green)"
                  : "var(--short-red)",
            }}
          >
            {computed
              ? `${computed.pnl >= 0 ? "+" : ""}${computed.pnl.toFixed(2)} (${computed.pnlPercent.toFixed(2)}%)`
              : "Loading..."}
          </div>
        </div>
      </div>

      <div className="stat-row">
        <span className="stat-label">Entry Price</span>
        <span className="stat-value">
          {computed ? formatUsd(computed.entryPrice) : "Loading..."}
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Current Price</span>
        <span className="stat-value">
          {computed ? formatUsd(computed.currentPrice) : "Loading..."}
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Initial Collateral</span>
        <span className="stat-value">
          {computed ? `${computed.collateral.toFixed(2)} USD` : "Loading..."}
        </span>
      </div>

      {computed && (
        <HealthBar
          remainingCollateral={computed.remainingCollateral}
          requiredMargin={computed.requiredMargin}
        />
      )}

      <button
        className="btn btn-short"
        style={{ marginTop: 16, width: "100%" }}
        disabled={closing}
        onClick={handleClosePosition}
      >
        {closing ? <div className="spinner" /> : "Close Position"}
      </button>
    </div>
  );
}
