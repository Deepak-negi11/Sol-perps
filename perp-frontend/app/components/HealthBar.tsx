"use client";

import React from "react";
import { BN } from "@coral-xyz/anchor";
import { lamportsToToken } from "@/lib/format";

interface HealthBarProps {
  remainingCollateral: BN;
  requiredMargin: BN;
}

export default function HealthBar({ remainingCollateral, requiredMargin }: HealthBarProps) {
  const collateralUsd = lamportsToToken(remainingCollateral);
  const requiredUsd = lamportsToToken(requiredMargin);

  let ratio = 0;
  if (requiredUsd > 0) {
    ratio = collateralUsd / requiredUsd;
  }

  const safetyPercent = Math.max(0, Math.min(100, (ratio - 1) * 100));

  let statusLabel = "Safe";
  let statusColor = "var(--long-green)";
  let barClass = "health-bar-safe";

  if (ratio <= 1.0) {
    statusLabel = "LIQUIDATABLE";
    statusColor = "var(--short-red)";
    barClass = "health-bar-danger pulse-danger";
  } else if (ratio < 1.25) {
    statusLabel = "Danger";
    statusColor = "var(--short-red)";
    barClass = "health-bar-danger pulse-danger";
  } else if (ratio < 1.5) {
    statusLabel = "Warning";
    statusColor = "var(--warning-amber)";
    barClass = "health-bar-warning";
  }

  return (
    <div className="health-container" style={{ marginTop: 14 }}>
      <div className="stat-row" style={{ marginBottom: 6 }}>
        <span className="stat-label">Liquidation Health</span>
        <span className="stat-value" style={{ color: statusColor, fontWeight: 700 }}>
          {statusLabel} ({ratio > 0 ? `${(ratio * 100).toFixed(0)}%` : "N/A"})
        </span>
      </div>

      <div className="health-bar-bg" style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
        <div
          className={`health-bar-fill ${barClass}`}
          style={{
            width: `${safetyPercent}%`,
            height: "100%",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 4 }}>
        <span>Liquidation Limit: {requiredUsd.toFixed(2)} USD</span>
        <span>Collateral: {collateralUsd.toFixed(2)} USD</span>
      </div>
    </div>
  );
}
