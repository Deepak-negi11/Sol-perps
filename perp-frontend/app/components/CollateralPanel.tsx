"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { useProgram } from "@/hooks/useProgram";
import { useUserCollateral } from "@/hooks/useUserCollateral";
import { MarketData } from "@/hooks/useMarket";
import { useToast } from "./Toast";
import { lamportsToToken, tokenToLamports } from "@/lib/format";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import {
  getLegacyUserCollateralPda,
  getUserCollateralPda,
  getVaultAuthorityPda,
  getMarketPda,
} from "@/lib/pda";
import { LEGACY_MARKET_PDA, type MarketSymbol } from "@/lib/constants";

interface CollateralPanelProps {
  market: MarketData | null;
  marketSymbol: MarketSymbol;
  onUpdate: () => void;
  onDepositSuccess?: () => void;
}

export default function CollateralPanel({ market, marketSymbol, onUpdate, onDepositSuccess }: CollateralPanelProps) {
  const { publicKey } = useWallet();
  const program = useProgram();
  const { data: userCollateral, availableAmount, refetch } =
    useUserCollateral(marketSymbol);
  const { addToast } = useToast();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [migrating, setMigrating] = useState(false);

  if (!publicKey) {
    return (
      <div className="glass-card card-body">
        <div className="section-header">
          <span className="section-title">Collateral</span>
        </div>
        <div className="empty-state">
          <div className="icon">💰</div>
          <div className="message">Connect wallet to manage collateral</div>
        </div>
      </div>
    );
  }

  const handleDeposit = async () => {
    if (!program || !market || !amount) return;
    setSending(true);
    try {
      const lamports = tokenToLamports(parseFloat(amount));
      const marketPda = getMarketPda(marketSymbol);
      const signature = await program.methods
        .depositCollateral(lamports)
        .accounts({
          market: marketPda,
          user: publicKey,
          collateralMint: market.collateralMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      addToast("Deposit successful!", "success", signature);
      setAmount("");
      await refetch();
      onUpdate();
      onDepositSuccess?.();
    } catch (error: unknown) {
      addToast(`Deposit failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setSending(false);
    }
  };

  const handleWithdraw = async () => {
    if (!program || !market || !amount) return;
    setSending(true);
    try {
      const lamports = tokenToLamports(parseFloat(amount));
      const marketPda = getMarketPda(marketSymbol);
      const vaultAuthority = getVaultAuthorityPda();
      const vaultTokenAccount = await getAssociatedTokenAddress(
        market.collateralMint,
        vaultAuthority,
        true
      );
      const userTokenAccount = await getAssociatedTokenAddress(
        market.collateralMint,
        publicKey
      );
      const signature = await program.methods
        .withdrawCollateral(lamports)
        .accounts({
          market: marketPda,
          user: publicKey,
          collateralMint: market.collateralMint,
          userCollateralTokenAccount: userTokenAccount,
          vaultAuthority,
          vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
      addToast("Withdrawal successful!", "success", signature);
      setAmount("");
      await refetch();
      onUpdate();
    } catch (error: unknown) {
      addToast(`Withdrawal failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setSending(false);
    }
  };

  const handleMigrateLegacyBalance = async () => {
    if (!program || !publicKey) return;
    setMigrating(true);
    try {
      const signature = await program.methods
        .migrateLegacyCollateral()
        .accounts({
          legacyMarket: LEGACY_MARKET_PDA,
          legacyUserCollateral: getLegacyUserCollateralPda(
            publicKey,
            LEGACY_MARKET_PDA,
          ),
          userCollateral: getUserCollateralPda(publicKey),
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      addToast("Legacy USDC imported into shared margin", "success", signature);
      await refetch();
      onUpdate();
    } catch (error: unknown) {
      addToast(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setMigrating(false);
    }
  };

  const deposited = userCollateral ? lamportsToToken(userCollateral.depositedAmount) : 0;
  const locked = userCollateral ? lamportsToToken(userCollateral.lockedAmount) : 0;
  const available = lamportsToToken(availableAmount);

  return (
    <div className="glass-card card-body">
      <div className="section-header">
        <span className="section-title">Collateral</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Deposited</span>
        <span className="stat-value">{deposited.toFixed(2)}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Locked</span>
        <span className="stat-value">{locked.toFixed(2)}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Available</span>
        <span className="stat-value" style={{ color: "var(--long-green)" }}>{available.toFixed(2)}</span>
      </div>

      {!userCollateral ? (
        <button
          className="btn"
          disabled={migrating}
          onClick={handleMigrateLegacyBalance}
        >
          {migrating ? "Importing..." : "Import legacy USDC balance"}
        </button>
      ) : null}

      <div className="tab-group" style={{ marginTop: 16 }}>
        <button
          className={`tab-btn ${tab === "deposit" ? "active active-deposit" : ""}`}
          onClick={() => setTab("deposit")}
        >
          Deposit
        </button>
        <button
          className={`tab-btn ${tab === "withdraw" ? "active active-withdraw" : ""}`}
          onClick={() => setTab("withdraw")}
        >
          Withdraw
        </button>
      </div>

      <div className="input-group">
        <label className="input-label">Amount</label>
        <div style={{ position: "relative" }}>
          <input
            type="number"
            className="input-field"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
            style={{ paddingRight: tab === "withdraw" ? 60 : undefined }}
          />
          {tab === "withdraw" && available > 0 && (
            <button
              className="max-btn"
              onClick={() => setAmount(available.toFixed(2))}
            >
              MAX
            </button>
          )}
        </div>
      </div>

      <button
        className={`btn ${tab === "deposit" ? "btn-long" : "btn-short"}`}
        disabled={!amount || parseFloat(amount) <= 0 || sending || !market}
        onClick={tab === "deposit" ? handleDeposit : handleWithdraw}
      >
        {sending ? (
          <div className="spinner" />
        ) : (
          tab === "deposit" ? "Deposit Collateral" : "Withdraw Collateral"
        )}
      </button>
    </div>
  );
}
