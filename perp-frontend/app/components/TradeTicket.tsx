"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { Minus, Plus } from "lucide-react";
import { MarketData } from "@/hooks/useMarket";
import { useProgram } from "@/hooks/useProgram";
import { useToast } from "./Toast";
import { lamportsToToken, tokenToLamports } from "@/lib/format";
import {
  getMarketPda,
  getOrderPda,
  getPositionPda,
  getUserCollateralPda,
  getVaultAuthorityPda,
} from "@/lib/pda";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import { usePosition } from "@/hooks/usePosition";
import { sendWithFreshPythPrice } from "@/lib/pyth";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

const DEFAULT_MAX_LEVERAGE = 250;
const DEFAULT_TRADING_FEE_BPS = 10;

interface TradeTicketProps {
  market: MarketData | null;
  marketSymbol: "SOL" | "ETH" | "WBTC";
  price: number;
  marketLoading?: boolean;
  onUpdate: () => void;
}

export default function TradeTicket({
  market,
  marketSymbol,
  price,
  marketLoading = false,
  onUpdate,
}: TradeTicketProps) {
  // Wallet/program hooks are the only parts of this component that can send
  // transactions. Everything below them is local UI state or derived display
  // state until one of the handler functions is called.
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useAnchorWallet();
  const program = useProgram();
  const {
    data: userCollateral,
    availableAmount,
    refetch,
  } = useUserCollateral(marketSymbol);
  const { position, refetch: refetchPosition } = usePosition(marketSymbol);
  const { addToast } = useToast();

  // Order form state. "side" and "mode" decide which contract instruction the
  // submit button calls: openPosition for market orders, placeLimitOrder for
  // limit orders, and placeTpSlOrder from the TP/SL card below.
  const [side, setSide] = useState<"long" | "short">("long");
  const [mode, setMode] = useState<"market" | "limit">("market");
  const [collateral, setCollateral] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [leverage, setLeverage] = useState(3);
  const [sending, setSending] = useState(false);

  // Chain values arrive as Anchor BN values in 6-decimal token units, so convert
  // them once here before using them in inputs, labels, and validation checks.
  const available = lamportsToToken(availableAmount);
  const maintenanceMaxLeverage = market
    ? Math.max(
        1,
        Math.floor(9_999 / market.liquidationThresholdBps.toNumber()),
      )
    : DEFAULT_MAX_LEVERAGE;
  const maxLeverage = market
    ? Math.min(
        DEFAULT_MAX_LEVERAGE,
        maintenanceMaxLeverage,
        Math.max(1, market.maxLeverage.toNumber()),
      )
    : DEFAULT_MAX_LEVERAGE;
  const activeLeverage = Math.min(leverage, maxLeverage);
  const feeBps = market
    ? market.tradingFeesBps.toNumber()
    : DEFAULT_TRADING_FEE_BPS;
  const parsedCollateral = Number.parseFloat(collateral) || 0;
  const marketPair = `${marketSymbol}/USDC`;
  const nextOrderId = market?.nextOrderId?.toNumber() ?? 0;

  // This summary is display-only. The contract does its own final fee, position
  // size, and liquidation math when the transaction lands on-chain.
  const summary = useMemo(() => {
    const fee = (parsedCollateral * feeBps) / 10_000;
    const size = Math.max(0, parsedCollateral - fee) * activeLeverage;
    const maintenanceMargin = market
      ? market.liquidationThresholdBps.toNumber() / 10_000
      : 0.05;
    const liquidationMove =
      activeLeverage > 0
        ? Math.max(0, 1 / activeLeverage - maintenanceMargin)
        : 0;
    const liq =
      side === "long"
        ? price * (1 - liquidationMove)
        : price * (1 + liquidationMove);
    return { fee, size, liq };
  }, [activeLeverage, feeBps, market, parsedCollateral, price, side]);

  // Market orders execute immediately against the oracle price update account.
  // The UI only supports the real on-chain SOL/USDC market for now.
  const handleOpen = async () => {
    if (!program || !market || !publicKey || !wallet || !parsedCollateral)
      return;
    setSending(true);
    try {
      const sideArg = side === "long" ? { long: {} } : { short: {} };
      const positionId = Date.now();
      addToast(
        "Wallet approval covers Pyth price update, trade execution, and cleanup.",
        "info",
      );
      const [sig] = await sendWithFreshPythPrice({
        connection,
        wallet,
        feedId: market.priceFeedId,
        buildInstructions: async (priceUpdateAccount) => [
          {
            instruction: await program.methods
              .openPosition(
                new BN(positionId),
                sideArg,
                tokenToLamports(parsedCollateral),
                new BN(activeLeverage),
              )
              .accounts({
                market: getMarketPda(marketSymbol),
                priceUpdate: priceUpdateAccount,
                userCollateral: getUserCollateralPda(publicKey, marketSymbol),
                position: getPositionPda(publicKey, positionId, marketSymbol),
                user: publicKey,
                systemProgram: SystemProgram.programId,
              })
              .instruction(),
            signers: [],
          },
        ],
      });
      addToast("Position opened", "success", sig);
      setCollateral("");
      await refetchPosition();
      onUpdate();
    } catch (error) {
      addToast(
        `Open failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  // Limit orders store an order PDA. A keeper/bot later calls executeTriggerOrder
  // once the oracle price crosses the above/below trigger condition.
  const handlePlaceLimit = async () => {
    if (!program || !market || !publicKey || !parsedCollateral || !limitPrice)
      return;
    setSending(true);
    try {
      const sideArg = side === "long" ? { long: {} } : { short: {} };
      const triggerCondition = side === "long" ? { below: {} } : { above: {} };
      const orderId = nextOrderId;
      const sig = await program.methods
        .placeLimitOrder(
          new BN(orderId),
          sideArg,
          tokenToLamports(parsedCollateral),
          new BN(activeLeverage),
          tokenToLamports(Number.parseFloat(limitPrice)),
          triggerCondition,
        )
        .accounts({
          market: getMarketPda(marketSymbol),
          userCollateral: getUserCollateralPda(publicKey, marketSymbol),
          order: getOrderPda(publicKey, orderId, marketSymbol),
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      addToast("Limit order placed", "success", sig);
      setCollateral("");
      setLimitPrice("");
      await refetch();
      await refetchPosition();
      onUpdate();
    } catch (error) {
      addToast(
        `Limit order failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  // TP and SL are also trigger orders, but they attach to an existing position
  // instead of opening a new one. If both fields are filled we create two PDAs.
  const handlePlaceTpSl = async () => {
    if (!program || !market || !publicKey || !position) return;
    const wantsTp = Boolean(takeProfitPrice);
    const wantsSl = Boolean(stopLossPrice);
    if (!wantsTp && !wantsSl) return;

    setSending(true);
    try {
      const positionIsLong = "long" in position.side;
      let orderId = nextOrderId;

      if (wantsTp) {
        const sig = await program.methods
          .placeTpSlOrder(
            new BN(orderId),
            position.positionId,
            { takeProfit: {} },
            tokenToLamports(Number.parseFloat(takeProfitPrice)),
            positionIsLong ? { above: {} } : { below: {} },
          )
          .accounts({
            market: getMarketPda(marketSymbol),
            position: position.publicKey,
            order: getOrderPda(publicKey, orderId, marketSymbol),
            user: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        addToast("Take-profit order placed", "success", sig);
        orderId += 1;
      }

      if (wantsSl) {
        const sig = await program.methods
          .placeTpSlOrder(
            new BN(orderId),
            position.positionId,
            { stopLoss: {} },
            tokenToLamports(Number.parseFloat(stopLossPrice)),
            positionIsLong ? { below: {} } : { above: {} },
          )
          .accounts({
            market: getMarketPda(marketSymbol),
            position: position.publicKey,
            order: getOrderPda(publicKey, orderId, marketSymbol),
            user: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        addToast("Stop-loss order placed", "success", sig);
      }

      setTakeProfitPrice("");
      setStopLossPrice("");
      await refetchPosition();
      onUpdate();
    } catch (error) {
      addToast(
        `TP/SL failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  // Button guards live close to the JSX so the disabled states and button labels
  // stay easy to compare. They do not replace contract-side validation.
  const canTrade =
    Boolean(publicKey) &&
    Boolean(market) &&
    !market?.isPaused &&
    parsedCollateral > 0 &&
    parsedCollateral <= available &&
    !sending;
  const canPlaceLimit =
    canTrade && mode === "limit" && Number.parseFloat(limitPrice) > 0;
  const canPlaceTpSl =
    Boolean(publicKey) &&
    Boolean(market) &&
    Boolean(position) &&
    (Number.parseFloat(takeProfitPrice) > 0 ||
      Number.parseFloat(stopLossPrice) > 0) &&
    !sending;

  return (
    <aside className="terminal-panel trade-ticket">
      {/* Wallet connection state: shown above the ticket controls when disconnected. */}
      {!publicKey ? (
        <div className="connect-state">
          <h2>Connect wallet</h2>
          <p>Please connect before starting to trade.</p>
          <WalletMultiButton className="wallet-btn" />
        </div>
      ) : null}

      {/* Margin mode is currently visual only; the contract is cross-margin style. */}
      <div className="ticket-row compact">
        <button className="ticket-pill active">Cross</button>
        <button className="ticket-pill">{activeLeverage}x</button>
      </div>

      {/* Long/short switch decides the PositionSide enum sent to Anchor. */}
      <div className="side-switch">
        <button
          className={side === "long" ? "active long" : ""}
          onClick={() => setSide("long")}
        >
          Buy / Long
        </button>
        <button
          className={side === "short" ? "active short" : ""}
          onClick={() => setSide("short")}
        >
          Sell / Short
        </button>
      </div>

      {/* Market vs limit switch decides which submit handler is wired below. */}
      <div className="mode-switch">
        <button
          className={mode === "market" ? "active" : ""}
          onClick={() => setMode("market")}
        >
          Market
        </button>
        <button
          className={mode === "limit" ? "active" : ""}
          onClick={() => setMode("limit")}
        >
          Limit
        </button>
        <span>
          {marketPair} ${price.toFixed(2)}
        </span>
      </div>

      {/* Every market currently uses its configured USDC SPL mint as collateral. */}
      <div className="ticket-card">
        <label>Collateral</label>
        <div className="amount-row">
          <span>USDC</span>
          <input
            type="number"
            min="0"
            value={collateral}
            onChange={(event) => setCollateral(event.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="ticket-muted">
          Available {available.toFixed(2)} USDC
        </div>
      </div>

      {/* Limit price only appears in limit mode because market orders use Pyth. */}
      {mode === "limit" ? (
        <div className="ticket-card">
          <label>Limit price</label>
          <div className="amount-row">
            <span>USDC</span>
            <input
              type="number"
              min="0"
              value={limitPrice}
              onChange={(event) => setLimitPrice(event.target.value)}
              placeholder={price.toFixed(2)}
            />
          </div>
          <div className="ticket-muted">
            Long triggers at or below price. Short triggers at or above price.
          </div>
        </div>
      ) : null}

      {/* Leverage is clamped by the market config fetched from chain. */}
      <div className="leverage-box">
        <button
          onClick={() => setLeverage(Math.max(1, activeLeverage - 1))}
          aria-label="Decrease leverage"
        >
          <Minus size={16} />
        </button>
        <strong>{activeLeverage.toFixed(1)}x</strong>
        <button
          onClick={() => setLeverage(Math.min(maxLeverage, activeLeverage + 1))}
          aria-label="Increase leverage"
        >
          <Plus size={16} />
        </button>
      </div>
      <input
        className="ticket-slider"
        type="range"
        min={1}
        max={maxLeverage}
        value={activeLeverage}
        onChange={(event) =>
          setLeverage(Number.parseInt(event.target.value, 10))
        }
      />
      <div className="slider-scale">
        <span>1x</span>
        <span>{Math.ceil(maxLeverage / 2)}x</span>
        <span>{maxLeverage}x</span>
      </div>

      <button
        className={
          side === "long" ? "ticket-submit long" : "ticket-submit short"
        }
        disabled={mode === "limit" ? !canPlaceLimit : !canTrade}
        onClick={mode === "limit" ? handlePlaceLimit : handleOpen}
      >
        {marketLoading
          ? "Loading market"
          : !market
              ? "Market not initialized"
              : available <= 0
                ? "Deposit or import shared USDC first"
              : market.isPaused
                  ? "Market paused"
                  : mode === "limit"
                    ? `Place ${side === "long" ? "Long" : "Short"} Limit`
                    : `${side === "long" ? "Long" : "Short"} ${marketPair}`}
      </button>

      {/* TP/SL creates trigger orders for the currently open position. */}
      <div className="ticket-card">
        <label>Take Profit / Stop Loss</label>
        <div className="trigger-order-grid">
          <input
            type="number"
            min="0"
            value={takeProfitPrice}
            onChange={(event) => setTakeProfitPrice(event.target.value)}
            placeholder="Take profit price"
          />
          <input
            type="number"
            min="0"
            value={stopLossPrice}
            onChange={(event) => setStopLossPrice(event.target.value)}
            placeholder="Stop loss price"
          />
        </div>
        <button
          className="trigger-order-submit"
          disabled={!canPlaceTpSl}
          onClick={handlePlaceTpSl}
        >
          {position ? "Place TP/SL" : "Open a position first"}
        </button>
      </div>

      {/* Preview numbers help the user understand the order before sending it. */}
      <div className="ticket-metrics">
        <div>
          <span>Position size</span>
          <strong>{summary.size.toFixed(2)} USDC</strong>
        </div>
        <div>
          <span>Est. liq. price</span>
          <strong>
            {parsedCollateral > 0 ? `$${summary.liq.toFixed(2)}` : "-"}
          </strong>
        </div>
        <div>
          <span>Trading fee</span>
          <strong>{summary.fee.toFixed(4)} USDC</strong>
        </div>
      </div>
    </aside>
  );
}
