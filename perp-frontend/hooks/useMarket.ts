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

export function useMarket(marketSymbol: MarketSymbol = "SOL") {
  // Market is a singleton PDA for this app. This hook also checks that the
  // configured program id is actually deployed before trying to fetch accounts.
  const { connection } = useConnection();
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketPda, setMarketPda] = useState<PublicKey | null>(null);

  const fetchMarket = useCallback(async () => {
    try {
      const pda = getMarketPda(marketSymbol);
      setMarketPda(pda);

      // If this fails on devnet, the frontend cannot initialize the market yet
      // because there is no deployed Anchor program to receive the transaction.
      const programAccount = await connection.getAccountInfo(PROGRAM_ID);
      if (!programAccount) {
        setMarket(null);
        setError("Program not deployed on devnet");
        return;
      }

      // A read-only provider is enough for fetching account data; write actions
      // use useProgram because they need the connected wallet signer.
      const dummyWallet = {
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
      const provider = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(idl as any, provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await (program.account as any).market.fetch(pda);
      setMarket(data as MarketData);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Account does not exist")) {
        setMarket(null);
        setError("Market not initialized");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [connection, marketSymbol]);

  useEffect(() => {
    // Polling keeps the terminal fresh after transactions from this wallet or
    // from an admin/keeper wallet without needing a websocket subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMarket();
    const interval = setInterval(fetchMarket, 5000);
    return () => clearInterval(interval);
  }, [fetchMarket]);

  const refetch = useCallback(() => {
    fetchMarket();
    setTimeout(fetchMarket, 1000);
    setTimeout(fetchMarket, 2500);
    setTimeout(fetchMarket, 5000);
  }, [fetchMarket]);

  return { market, marketPda, loading, error, refetch };
}
