"use client";

import React, { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "@/hooks/useProgram";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import { MarketData } from "@/hooks/useMarket";
import { useToast } from "./Toast";
import { lamportsToToken, tokenToLamports, formatBps } from "@/lib/format";
import { usePythPrice } from "@/hooks/usePythPrice";
import { getMarketPda } from "@/lib/pda";
import { BN } from "@coral-xyz/anchor";

interface TradingPanelProps {
  market: MarketData | null;
  onUpdate: () => void;
}

const DEFAULT_MAX_LEVERAGE = 250;

export default function TradingPanel({ market, onUpdate }: TradingPanelProps) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const { availableAmount } = useUserCollateral();
  const { priceData } = usePythPrice();
  const { addToast } = useToast();
  const [side, setSide] = useState<"long" | "short">("long");
  const [collateralInput, setCollateralInput] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [sending, setSending] = useState(false);

  const maxLeverage = market
    ? Math.min(DEFAULT_MAX_LEVERAGE, Math.max(1, market.maxLeverage.toNumber()))
    : DEFAULT_MAX_LEVERAGE;
  const tradingFeeBps = market ? market.tradingFeesBps.toNumber() : 0;
  const available = lamportsToToken(availableAmount);

  const computedValues = useMemo(() => {
    const collateral = parseFloat(collateralInput) || 0;
    const fee = (collateral * tradingFeeBps) / 10000;
    const collateralAfterFee = collateral - fee;
    const positionSize = collateralAfterFee * leverage;
    return { collateral, fee, collateralAfterFee, positionSize };
  }, [collateralInput, leverage, tradingFeeBps]);

  if (!publicKey) {
    return (
      <div className="glass-card card-body">
        <div className="section-header">
          <span className="section-title">Trade</span>
        </div>
        <div className="empty-state">
          <div className="icon">📈</div>
          <div className="message">Connect wallet to trade</div>
        </div>
      </div>
    );
  }

  const handleOpenPosition = async () => {
    if (!program || !market || !priceData) return;
    setSending(true);
    try {
      const collateralLamports = tokenToLamports(parseFloat(collateralInput));
      const sideArg = side === "long" ? { long: {} } : { short: {} };
      const leverageBN = new BN(leverage);

      // For devnet, we need to get the Pyth price update account
      // This uses the Pyth pull oracle on devnet
      addToast("Sending transaction...", "info");

      const marketPda = getMarketPda();

      const sig = await program.methods
        .openPosition(sideArg, collateralLamports, leverageBN)
        .accounts({
          market: marketPda,
          // Note: priceUpdate needs to be a valid Pyth PriceUpdateV2 account on-chain
          // For devnet testing, you'll need to push a price update first
          user: publicKey,
        })
        .rpc();

      addToast(`Position opened!`, "success", sig);
      setCollateralInput("");
      setLeverage(1);
      onUpdate();
    } catch (e: unknown) {
      addToast(
        `Failed: ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="glass-card card-body">
      <div className="section-header">
        <span className="section-title">Open Position</span>
        {priceData && (
          <span className="stat-value" style={{ fontSize: "0.8rem" }}>
            SOL ${priceData.price.toFixed(2)}
          </span>
        )}
      </div>

      {/* Side toggle */}
      <div className="tab-group">
        <button
          className={`tab-btn ${side === "long" ? "active active-long" : ""}`}
          onClick={() => setSide("long")}
        >
          🟢 Long
        </button>
        <button
          className={`tab-btn ${side === "short" ? "active active-short" : ""}`}
          onClick={() => setSide("short")}
        >
          🔴 Short
        </button>
      </div>

      {/* Collateral input */}
      <div className="input-group">
        <label className="input-label">Collateral</label>
        <div style={{ position: "relative" }}>
          <input
            type="number"
            className="input-field"
            placeholder="0.00"
            value={collateralInput}
            onChange={(e) => setCollateralInput(e.target.value)}
            step="0.01"
            min="0"
            style={{ paddingRight: 60 }}
          />
          <button
            className="max-btn"
            onClick={() => setCollateralInput(available.toFixed(2))}
          >
            MAX
          </button>
        </div>
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          Available: {available.toFixed(2)}
        </div>
      </div>

      {/* Leverage slider */}
      <div className="input-group">
        <label className="input-label">
          Leverage:{" "}
          <span
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {leverage}x
          </span>
        </label>
        <input
          type="range"
          className="leverage-slider"
          min={1}
          max={maxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(parseInt(e.target.value))}
        />
        <div className="leverage-marks">
          <span>1x</span>
          <span>{Math.floor(maxLeverage / 2)}x</span>
          <span>{maxLeverage}x</span>
        </div>
      </div>

      {/* Computed values */}
      {computedValues.collateral > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="stat-row">
            <span className="stat-label">Trading Fee</span>
            <span className="stat-value" style={{ color: "var(--short-red)" }}>
              -{computedValues.fee.toFixed(4)} ({formatBps(tradingFeeBps)})
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Position Size</span>
            <span className="stat-value">
              {computedValues.positionSize.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <button
        className={`btn ${side === "long" ? "btn-long" : "btn-short"}`}
        disabled={
          !computedValues.collateral ||
          computedValues.collateral > available ||
          sending ||
          !market ||
          market.isPaused
        }
        onClick={handleOpenPosition}
      >
        {sending ? (
          <div className="spinner" />
        ) : market?.isPaused ? (
          "Market Paused"
        ) : (
          `Open ${side === "long" ? "Long" : "Short"} ${leverage}x`
        )}
      </button>
    </div>
  );
}
