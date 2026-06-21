"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "@/hooks/useProgram";
import { MarketData } from "@/hooks/useMarket";
import { useToast } from "./Toast";
import { getMarketPda, getVaultAuthorityPda } from "@/lib/pda";
import {
  DEVNET_COLLATERAL_MINT,
  MARKET_BASE_FEED_IDS,
  MARKET_QUOTE_FEED_IDS,
  type MarketSymbol,
} from "@/lib/constants";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { tokenToLamports, lamportsToToken } from "@/lib/format";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

interface AdminPanelProps {
  market: MarketData | null;
  marketSymbol: MarketSymbol;
  loading: boolean;
  onUpdate: () => void;
}

export default function AdminPanel({
  market,
  marketSymbol,
  loading,
  onUpdate,
}: AdminPanelProps) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const { addToast } = useToast();

  const [initializing, setInitializing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [updatingLiquidity, setUpdatingLiquidity] = useState(false);

  const [initMint, setInitMint] = useState(DEVNET_COLLATERAL_MINT);
  const [initBaseFeed, setInitBaseFeed] = useState(MARKET_BASE_FEED_IDS[marketSymbol]);
  const [initQuoteFeed, setInitQuoteFeed] = useState(MARKET_QUOTE_FEED_IDS[marketSymbol]);
  const [initMaxLeverage, setInitMaxLeverage] = useState("100");
  const [initLiqBps, setInitLiqBps] = useState("50");
  const [initFeeBps, setInitFeeBps] = useState("10");

  const [maxLeverage, setMaxLeverage] = useState("");
  const [liqBps, setLiqBps] = useState("");
  const [feeBps, setFeeBps] = useState("");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [liquidityAmount, setLiquidityAmount] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitBaseFeed(MARKET_BASE_FEED_IDS[marketSymbol]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitQuoteFeed(MARKET_QUOTE_FEED_IDS[marketSymbol]);
  }, [marketSymbol]);

  if (loading) return null;

  const isAdmin =
    market && publicKey && market.admin.toString() === publicKey.toString();

  const handleInitMarket = async () => {
    if (!program || !publicKey || !initMint) return;
    setInitializing(true);
    try {
      addToast("Initializing market...", "info");
      const mintPubkey = new PublicKey(initMint);
      const baseFeedBytes = Array.from(Buffer.from(initBaseFeed, "hex"));
      const quoteFeedBytes = Array.from(Buffer.from(initQuoteFeed, "hex"));

      const signature = await program.methods
        .initializeMarket(
          new BN(initMaxLeverage),
          new BN(initLiqBps),
          new BN(initFeeBps),
          baseFeedBytes,
          quoteFeedBytes,
        )
        .accounts({
          market: getMarketPda(marketSymbol),
          admin: publicKey,
          collateralMint: mintPubkey,
        })
        .rpc();

      addToast("Market initialized successfully!", "success", signature);
      onUpdate();
    } catch (error: unknown) {
      addToast(
        `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setInitializing(false);
    }
  };

  const handleUpdateConfig = async () => {
    if (!program || !market || !publicKey) return;
    setUpdating(true);
    try {
      const finalLeverage = maxLeverage
        ? new BN(maxLeverage)
        : market.maxLeverage;
      const finalLiq = liqBps ? new BN(liqBps) : market.liquidationThresholdBps;
      const finalFee = feeBps ? new BN(feeBps) : market.tradingFeesBps;

      addToast("Updating market config...", "info");

      const signature = await program.methods
        .updateMarketConfig(finalLeverage, finalLiq, finalFee)
        .accounts({
          market: getMarketPda(marketSymbol),
          admin: publicKey,
        })
        .rpc();

      addToast("Config updated successfully!", "success", signature);
      setMaxLeverage("");
      setLiqBps("");
      setFeeBps("");
      onUpdate();
    } catch (error: unknown) {
      addToast(
        `Failed to update config: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setUpdating(false);
    }
  };

  const handlePause = async (pause: boolean) => {
    if (!program || !publicKey) return;
    try {
      addToast(pause ? "Pausing market..." : "Resuming market...", "info");

      const signature = pause
        ? await program.methods
            .pauseMarket()
            .accounts({ market: getMarketPda(marketSymbol), admin: publicKey })
            .rpc()
        : await program.methods
            .resumeMarket()
            .accounts({ market: getMarketPda(marketSymbol), admin: publicKey })
            .rpc();

      addToast(pause ? "Market paused!" : "Market resumed!", "success", signature);
      onUpdate();
    } catch (error: unknown) {
      addToast(
        `Failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  };

  const handleWithdrawFees = async () => {
    if (!program || !market || !publicKey || !withdrawAmount) return;
    setWithdrawing(true);
    try {
      addToast("Withdrawing fees...", "info");
      const marketPda = getMarketPda(marketSymbol);
      const vaultAuthority = getVaultAuthorityPda();
      const vaultTokenAccount = await getAssociatedTokenAddress(
        market.collateralMint,
        vaultAuthority,
        true,
      );
      const adminTokenAccount = await getAssociatedTokenAddress(
        market.collateralMint,
        publicKey,
      );

      const lamports = tokenToLamports(parseFloat(withdrawAmount));

      const signature = await program.methods
        .withdrawProtocolFees(lamports)
        .accounts({
          market: marketPda,
          vaultAuthority,
          collateralMint: market.collateralMint,
          vaultTokenAccount,
          adminTokenAccount,
          admin: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      addToast("Fees withdrawn successfully!", "success", signature);
      setWithdrawAmount("");
      onUpdate();
    } catch (error: unknown) {
      addToast(
        `Failed to withdraw fees: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setWithdrawing(false);
    }
  };

  const handleLiquidity = async (action: "add" | "remove") => {
    if (!program || !market || !publicKey || !liquidityAmount) return;
    setUpdatingLiquidity(true);
    try {
      addToast(
        action === "add"
          ? "Adding pool liquidity..."
          : "Removing pool liquidity...",
        "info",
      );

      const marketPda = getMarketPda(marketSymbol);
      const vaultAuthority = getVaultAuthorityPda();
      const vaultTokenAccount = await getAssociatedTokenAddress(
        market.collateralMint,
        vaultAuthority,
        true,
      );
      const adminTokenAccount = await getAssociatedTokenAddress(
        market.collateralMint,
        publicKey,
      );
      const lamports = tokenToLamports(parseFloat(liquidityAmount));

      const txBuilder =
        action === "add"
          ? program.methods.addLiquidity(lamports).accounts({
              market: marketPda,
              vaultAuthority,
              collateralMint: market.collateralMint,
              adminTokenAccount,
              vaultTokenAccount,
              admin: publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
          : program.methods.removeLiquidity(lamports).accounts({
              market: marketPda,
              vaultAuthority,
              collateralMint: market.collateralMint,
              vaultTokenAccount,
              adminTokenAccount,
              admin: publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            });

      const signature = await txBuilder.rpc();
      addToast(
        action === "add" ? "Liquidity added!" : "Liquidity removed!",
        "success",
        signature,
      );
      setLiquidityAmount("");
      onUpdate();
    } catch (error: unknown) {
      addToast(
        `Liquidity update failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setUpdatingLiquidity(false);
    }
  };

  if (!market) {
    return (
      <div className="setup-console">
        <div className="setup-console-head">
          <div>
            <span>Setup Required</span>
            <strong>Initialize {marketSymbol}/USDC market</strong>
          </div>
          <em>Devnet</em>
        </div>
        <div className="setup-grid">
          <label className="setup-field wide">
            <span>Collateral mint</span>
            <input
              type="text"
              placeholder="Paste devnet USDC/test-USDC mint address"
              value={initMint}
              onChange={(e) => setInitMint(e.target.value)}
            />
          </label>
          <label className="setup-field wide">
            <span>Base feed (SOL/USD)</span>
            <input
              type="text"
              value={initBaseFeed}
              onChange={(e) => setInitBaseFeed(e.target.value)}
            />
          </label>
          <label className="setup-field wide">
            <span>Quote feed (HYPE/USD)</span>
            <input
              type="text"
              value={initQuoteFeed}
              onChange={(e) => setInitQuoteFeed(e.target.value)}
            />
          </label>
          <label className="setup-field">
            <span>Max leverage</span>
            <input
              type="number"
              value={initMaxLeverage}
              onChange={(e) => setInitMaxLeverage(e.target.value)}
            />
          </label>
          <label className="setup-field">
            <span>Liq. bps</span>
            <input
              type="number"
              value={initLiqBps}
              onChange={(e) => setInitLiqBps(e.target.value)}
            />
          </label>
          <label className="setup-field">
            <span>Fee bps</span>
            <input
              type="number"
              value={initFeeBps}
              onChange={(e) => setInitFeeBps(e.target.value)}
            />
          </label>
        </div>
        <button
          className="setup-submit"
          disabled={initializing || !initMint || !program || !publicKey}
          onClick={handleInitMarket}
        >
          {initializing
            ? "Initializing..."
            : !publicKey
              ? "Connect admin wallet"
              : !initMint
                ? "Enter collateral mint"
                : "Initialize market"}
        </button>
      </div>
    );
  }

  return (
    <div className="admin-tab-pane">
      <div className="admin-header-row">
        <div className="admin-title-group">
          <span className="admin-title">Admin Console</span>
          <span className={`admin-badge ${isAdmin ? "admin-badge-active" : ""}`}>
            {isAdmin ? " Admin" : " Read-only"}
          </span>
        </div>
        {isAdmin && (
          <button
            className={`admin-pause-btn ${market.isPaused ? "paused" : ""}`}
            onClick={() => handlePause(!market.isPaused)}
          >
            {market.isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
        )}
      </div>

      <div className="admin-section">
        <div className="admin-section-label">Parameters</div>
        <div className="admin-config-grid">
          <div className="admin-field">
            <label>Max Lev <span className="admin-field-current">({market.maxLeverage.toString()})</span></label>
            <input
              type="number"
              placeholder="New"
              value={maxLeverage}
              onChange={(e) => setMaxLeverage(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="admin-field">
            <label>Liq Bps <span className="admin-field-current">({market.liquidationThresholdBps.toString()})</span></label>
            <input
              type="number"
              placeholder="New"
              value={liqBps}
              onChange={(e) => setLiqBps(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="admin-field">
            <label>Fee Bps <span className="admin-field-current">({market.tradingFeesBps.toString()})</span></label>
            <input
              type="number"
              placeholder="New"
              value={feeBps}
              onChange={(e) => setFeeBps(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        </div>
        {isAdmin && (
          <button
            className="admin-save-btn"
            disabled={updating || (!maxLeverage && !liqBps && !feeBps)}
            onClick={handleUpdateConfig}
          >
            {updating ? <div className="spinner" /> : "Save"}
          </button>
        )}
      </div>

      <div className="admin-section">
        <div className="admin-section-label">
          Protocol Fees
          <span className="admin-value-badge">
            {lamportsToToken(market.totalTradingFeesCollected).toFixed(4)}
          </span>
        </div>
        {isAdmin && (
          <div className="admin-action-row">
            <input
              type="number"
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            <button
              className="admin-action-btn"
              disabled={
                withdrawing ||
                !withdrawAmount ||
                parseFloat(withdrawAmount) <= 0
              }
              onClick={handleWithdrawFees}
            >
              {withdrawing ? <div className="spinner" /> : "Withdraw"}
            </button>
          </div>
        )}
      </div>

      <div className="admin-section" style={{ borderBottom: "none" }}>
        <div className="admin-section-label">
          Pool Liquidity
          <span className="admin-value-badge">
            {lamportsToToken(market.poolBalance).toFixed(4)}
          </span>
        </div>
        {isAdmin && (
          <div className="admin-action-row">
            <input
              type="number"
              placeholder="0.00"
              value={liquidityAmount}
              onChange={(e) => setLiquidityAmount(e.target.value)}
            />
            <button
              className="admin-action-btn green"
              disabled={
                updatingLiquidity ||
                !liquidityAmount ||
                parseFloat(liquidityAmount) <= 0
              }
              onClick={() => handleLiquidity("add")}
            >
              Add
            </button>
            <button
              className="admin-action-btn red"
              disabled={
                updatingLiquidity ||
                !liquidityAmount ||
                parseFloat(liquidityAmount) <= 0
              }
              onClick={() => handleLiquidity("remove")}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
