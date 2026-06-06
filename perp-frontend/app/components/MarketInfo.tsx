"use client";

import React from "react";
import { MarketData } from "@/hooks/useMarket";
import { formatBps, lamportsToToken } from "@/lib/format";
import { usePythPrice } from "@/hooks/usePythPrice";

interface MarketInfoProps {
  market: MarketData | null;
  loading: boolean;
  error: string | null;
}

export default function MarketInfo({
  market,
  loading,
  error,
}: MarketInfoProps) {
  const { priceData } = usePythPrice();

  if (loading) {
    return (
      <div className="glass-card card-body">
        <div className="section-header">
          <span className="section-title">Market Overview</span>
        </div>
        <div className="empty-state">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error === "Market not initialized" || !market) {
    return (
      <div className="glass-card card-body">
        <div className="section-header">
          <span className="section-title">Market Overview</span>
        </div>
        <div className="empty-state">
          <div className="icon">📊</div>
          <div className="message">
            Market not initialized yet.
            <br />
            Use Admin Panel to initialize.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card card-body">
      <div className="section-header">
        <span className="section-title">Market Overview</span>
        <span
          className={`section-badge ${market.isPaused ? "badge-paused" : "badge-active"}`}
        >
          {market.isPaused ? "⏸ Paused" : "● Live"}
        </span>
      </div>

      {priceData && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 16,
            padding: "12px 0",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 4,
            }}
          >
            SOL / USD
          </div>
          <div
            style={{
              fontSize: "1.6rem",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
            }}
          >
            ${priceData.price.toFixed(2)}
          </div>
        </div>
      )}

      <div className="stat-row">
        <span className="stat-label">Max Leverage</span>
        <span className="stat-value">{market.maxLeverage.toString()}x</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Trading Fee</span>
        <span className="stat-value">
          {formatBps(market.tradingFeesBps.toNumber())}
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Liq. Threshold</span>
        <span className="stat-value">
          {formatBps(market.liquidationThresholdBps.toNumber())}
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Fees Collected</span>
        <span className="stat-value">
          {lamportsToToken(market.totalTradingFeesCollected).toFixed(2)}
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Pool Balance</span>
        <span className="stat-value">
          {lamportsToToken(market.poolBalance).toFixed(2)}
        </span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Open Interest</span>
        <span className="stat-value">
          L {lamportsToToken(market.openInterestLong).toFixed(2)} / S{" "}
          {lamportsToToken(market.openInterestShort).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
