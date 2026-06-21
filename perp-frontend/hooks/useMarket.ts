"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { getMarketPda } from "@/lib/pda";
import { PROGRAM_ID } from "@/lib/constants";
import type { MarketSymbol } from "@/lib/constants";
import idl from "@/lib/idl/solperp_anchor.json";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";

export interface MarketData {
  admin: PublicKey;
  maxLeverage: BN;
  priceFeedId: number[];
  quoteFeedId: number[];
  collateralMint: PublicKey;
  liquidationThresholdBps: BN;
  tradingFeesBps: BN;
  totalTradingFeesCollected: BN;
  poolBalance: BN;
  openInterestLong: BN;
  openInterestShort: BN;
  nextOrderId: BN;
  isPaused: boolean;
  bump: number;
}

export function useMarket(marketSymbol: MarketSymbol = "SOLHYPE") {
  const { connection } = useConnection();
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketPda, setMarketPda] = useState<PublicKey | null>(null);

  const fetchMarket = useCallback(async () => {
    try {
      const marketAddress = getMarketPda(marketSymbol);
      setMarketPda(marketAddress);

      const deployedProgram = await connection.getAccountInfo(PROGRAM_ID);
      if (!deployedProgram) {
        setMarket(null);
        setError("Program not deployed on devnet");
        return;
      }

      const readonlyWallet = {
        publicKey: PublicKey.default,
        signTransaction: async <T extends Transaction | VersionedTransaction>(
          tx: T,
        ) => tx,
        signAllTransactions: async <
          T extends Transaction | VersionedTransaction,
        >(
          txs: T[],
        ) => txs,
      };
      const provider = new AnchorProvider(connection, readonlyWallet, { commitment: "confirmed" });
      
      const program = new Program(idl as any, provider);
      
      const marketAccount = await (program.account as any).market.fetch(marketAddress);
      setMarket(marketAccount as MarketData);
      setError(null);
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message.includes("Account does not exist")) {
        setMarket(null);
        setError("Market not initialized");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [connection, marketSymbol]);

  useEffect(() => {
    
    fetchMarket();

    const marketAddress = getMarketPda(marketSymbol);
    const subscriptionId = connection.onAccountChange(marketAddress, () => fetchMarket(), "confirmed");
    const safetyTimer = setInterval(fetchMarket, 30_000);

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
      clearInterval(safetyTimer);
    };
  }, [connection, marketSymbol, fetchMarket]);

  const refetch = useCallback(() => {
    fetchMarket();
    setTimeout(fetchMarket, 1000);
    setTimeout(fetchMarket, 2500);
    setTimeout(fetchMarket, 5000);
  }, [fetchMarket]);

  return { market, marketPda, loading, error, refetch };
}
