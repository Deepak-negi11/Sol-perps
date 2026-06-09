"use client";

import React, { useMemo, useState } from "react";
import { MarketData } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { useProgram } from "@/hooks/useProgram";
import { useToast } from "./Toast";
import { usePythPrice } from "@/hooks/usePythPrice";
import { lamportsToToken, formatUsd } from "@/lib/format";
import { getMarketPda } from "@/lib/pda";
import { BN } from "@coral-xyz/anchor";
import { sendWithFreshPythPrice } from "@/lib/pyth";
import type { PublicKey } from "@solana/web3.js";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import type { MarketSymbol } from "@/lib/constants";
import { useTradeHistory } from "@/hooks/useTradeHistory";

interface PositionsDockProps {
  market: MarketData | null;
  marketSymbol: MarketSymbol;
  onUpdate: () => void;
}

type TabType = "positions" | "balances" | "history";

export default function PositionsDock({
  market,
  marketSymbol,
  onUpdate,
}: PositionsDockProps) {
  // This dock combines live positions, shared collateral, and RPC-parsed
  // on-chain trade events for the selected market.
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useAnchorWallet();
  const { positions, refetch } = usePosition(marketSymbol);
  const { priceData } = usePythPrice(marketSymbol);
  const program = useProgram();
  const { addToast } = useToast();

  const { data: userCollateral, availableAmount } =
    useUserCollateral(marketSymbol);
  const {
    history,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useTradeHistory();
  const [activeTab, setActiveTab] = useState<TabType>("positions");
  const [closing, setClosing] = useState(false);
  const effectiveTab = activeTab;

  // Compute display PnL from the current Pyth price and on-chain positions.
  // The close instruction still asks the contract to calculate the final PnL.
  const computedPositions = useMemo(() => {
    if (!positions.length || !priceData) return [];

    return positions.map((position) => {
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

      const pnl = position.positionSize.mul(priceDiff).div(entryPrice);
      const signedPnl = isLoss ? pnl.neg() : pnl;
      const sizeUsd = lamportsToToken(position.positionSize);
      const collateralUsd = lamportsToToken(position.collateral);
      const pnlUsd = lamportsToToken(signedPnl);
      const pnlPercent = (pnlUsd / (collateralUsd || 1)) * 100;

      // Est. liquidation price for display. It mirrors the ticket preview and is
      // not a substitute for the contract's health checks.
      const activeLeverage = position.leverage.toNumber();
      const maintenanceMargin = market
        ? market.liquidationThresholdBps.toNumber() / 10_000
        : 0.05;
      const liquidationMove =
        activeLeverage > 0
          ? Math.max(0, 1 / activeLeverage - maintenanceMargin)
          : 0;
      const liqPrice = isLong
        ? lamportsToToken(entryPrice) * (1 - liquidationMove)
        : lamportsToToken(entryPrice) * (1 + liquidationMove);

      return {
        publicKey: position.publicKey,
        isLong,
        size: sizeUsd,
        collateral: collateralUsd,
        leverage: activeLeverage,
        entryPrice: lamportsToToken(entryPrice),
        markPrice: priceData.price,
        liqPrice,
        pnl: pnlUsd,
        pnlPercent,
      };
    });
  }, [market, positions, priceData]);

  // closePosition realizes PnL, unlocks collateral, and clears the user's
  // position account according to the contract instruction.
  const handleClose = async (positionPublicKey: PublicKey) => {
    if (!program || !market || !publicKey || !wallet) return;
    setClosing(true);
    try {
      addToast(
        "Wallet approval covers Pyth price update, close execution, and cleanup.",
        "info",
      );
      const [sig] = await sendWithFreshPythPrice({
        connection,
        wallet,
        feedId: market.priceFeedId,
        buildInstructions: async (priceUpdateAccount) => [
          {
            instruction: await program.methods
              .closePosition()
              .accounts({
                market: getMarketPda(marketSymbol),
                position: positionPublicKey,
                priceUpdate: priceUpdateAccount,
                user: publicKey,
              })
              .instruction(),
            signers: [],
          },
        ],
      });
      addToast("Position closed successfully", "success", sig);
      await refetch();
      await refetchHistory();
      onUpdate();
    } catch (error) {
      addToast(
        `Close failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <section className="positions-dock" aria-label="Terminal Dock">
      <div className="dock-tabs">
        <button
          className={effectiveTab === "positions" ? "active" : ""}
          onClick={() => setActiveTab("positions")}
        >
          Positions
        </button>
        <button
          className={effectiveTab === "balances" ? "active" : ""}
          onClick={() => setActiveTab("balances")}
        >
          Balances
        </button>
        <button
          className={effectiveTab === "history" ? "active" : ""}
          onClick={() => {
            setActiveTab("history");
            void refetchHistory();
          }}
        >
          Trade History
        </button>
      </div>

      <div className="dock-content">
        {/* Positions tab: shows the single open position PDA for the wallet. */}
        {effectiveTab === "positions" && (
          <div className="dock-tab-pane">
            {!publicKey ? (
              <div className="dock-empty">
                Connect your wallet to see active positions
              </div>
            ) : computedPositions.length ? (
              <div className="positions-table-wrapper">
                <table className="positions-grid-table">
                  <colgroup>
                    <col style={{ width: "150px" }} />
                    <col style={{ width: "170px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "200px" }} />
                    <col style={{ width: "110px" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Size</th>
                      <th>Collateral</th>
                      <th>Entry Price</th>
                      <th>Mark Price</th>
                      <th>Liq Price</th>
                      <th>Unrealized PnL</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedPositions.map((computedPosition) => {
                      const sizeInTokens = computedPosition.size / (computedPosition.markPrice || 1);
                      return (
                        <tr key={computedPosition.publicKey.toString()}>
                          <td>
                            <div className="pos-market-cell">
                              <span className="pos-market-pair">{marketSymbol}-PERP</span>
                              <div className="pos-market-sub">
                                <span className={`side-badge mini ${computedPosition.isLong ? "long" : "short"}`}>
                                  {computedPosition.isLong ? "LONG" : "SHORT"}
                                </span>
                                <span className="pos-leverage-text">{computedPosition.leverage}x</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="pos-size-cell">
                              <div className={`pos-size-token ${computedPosition.isLong ? "text-long" : "text-short"}`}>
                                {sizeInTokens.toFixed(3)} {marketSymbol === "WBTC" ? "BTC" : marketSymbol}
                              </div>
                              <div className="pos-size-usd">
                                {formatUsd(computedPosition.size)}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="pos-collateral-text">
                              {formatUsd(computedPosition.collateral)}
                            </span>
                          </td>
                          <td>
                            <span className="pos-price-text">
                              {formatUsd(computedPosition.entryPrice)}
                            </span>
                          </td>
                          <td>
                            <span className="pos-price-text mark-price">
                              {formatUsd(computedPosition.markPrice)}
                            </span>
                          </td>
                          <td>
                            <span className="pos-price-text liq-price">
                              {formatUsd(computedPosition.liqPrice)}
                            </span>
                          </td>
                          <td>
                            <div className="pos-pnl-cell">
                              <div className={`pos-pnl-usd ${computedPosition.pnl >= 0 ? "text-long" : "text-short"}`}>
                                {computedPosition.pnl >= 0 ? "+" : ""}{formatUsd(computedPosition.pnl)}
                              </div>
                              <div className={`pos-pnl-percent ${computedPosition.pnl >= 0 ? "text-long" : "text-short"}`}>
                                {computedPosition.pnl >= 0 ? "+" : ""}{computedPosition.pnlPercent.toFixed(2)}%
                              </div>
                            </div>
                          </td>
                          <td>
                            <button
                              className="close-pos-btn"
                              disabled={closing}
                              onClick={() => handleClose(computedPosition.publicKey)}
                            >
                              {closing ? "..." : "Close"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dock-empty">
                {market
                  ? `No active position. Pool balance ${lamportsToToken(market.poolBalance).toFixed(2)} USDC.`
                  : "Initialize the market before opening positions."}
              </div>
            )}
          </div>
        )}

        {/* Balances tab: shows a table of the user's collateral ledger. */}
        {effectiveTab === "balances" && (
          <div className="dock-tab-pane">
            {!publicKey ? (
              <div className="dock-empty">
                Connect your wallet to view balances
              </div>
            ) : (
              <div className="positions-table-wrapper">
                <table className="balances-grid-table">
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "28%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Total Deposited</th>
                      <th>Locked (In Trade)</th>
                      <th>Available to Withdraw</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 800, color: "#fff" }}>USDC</td>
                      <td>
                        {lamportsToToken(
                          userCollateral?.depositedAmount || new BN(0),
                        ).toFixed(2)}{" "}
                        USDC
                      </td>
                      <td style={{ color: "var(--warning-amber)" }}>
                        {lamportsToToken(
                          userCollateral?.lockedAmount || new BN(0),
                        ).toFixed(2)}{" "}
                        USDC
                      </td>
                      <td style={{ color: "var(--long-green)", fontWeight: 700 }}>
                        {lamportsToToken(availableAmount).toFixed(2)} USDC
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {effectiveTab === "history" && (
          <div className="dock-tab-pane">
            {!publicKey ? (
              <div className="dock-empty">
                Connect your wallet to view trade history
              </div>
            ) : historyLoading ? (
              <div className="dock-empty">Loading trade history...</div>
            ) : historyError ? (
              <div className="dock-empty" title={historyError}>
                Unable to load trade history: {historyError}
              </div>
            ) : history.length ? (
              <div className="positions-table-wrapper">
                <table className="history-grid-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Market</th>
                      <th>Action</th>
                      <th>Side</th>
                      <th>Price</th>
                      <th>Size</th>
                      <th>Collateral</th>
                      <th>PnL</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.blockTime
                            ? new Date(item.blockTime * 1000).toLocaleString()
                            : "-"}
                        </td>
                        <td>{item.marketSymbol}/USDC</td>
                        <td>
                          <span
                            className={`history-action ${item.action.toLowerCase()}`}
                          >
                            {item.action}
                          </span>
                        </td>
                        <td className={item.isLong ? "text-long" : "text-short"}>
                          {item.isLong ? "Long" : "Short"}
                        </td>
                        <td>{formatUsd(item.price)}</td>
                        <td>
                          {item.size === null ? "-" : formatUsd(item.size)}
                        </td>
                        <td>
                          {item.collateral === null
                            ? "-"
                            : formatUsd(item.collateral)}
                        </td>
                        <td
                          className={
                            item.pnl === null
                              ? ""
                              : item.pnl >= 0
                                ? "text-long"
                                : "text-short"
                          }
                        >
                          {item.pnl === null
                            ? "-"
                            : `${item.pnl >= 0 ? "+" : ""}${formatUsd(item.pnl)}`}
                        </td>
                        <td>
                          <a
                            className="history-tx-link"
                            href={`https://explorer.solana.com/tx/${item.signature}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.signature.slice(0, 5)}...
                            {item.signature.slice(-4)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dock-empty">
                No trades found for this wallet
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
