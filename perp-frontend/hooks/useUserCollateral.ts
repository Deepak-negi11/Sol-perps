"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { getUserCollateralPda } from "@/lib/pda";
import idl from "@/lib/idl/solperp_anchor.json";
import type { MarketSymbol } from "@/lib/constants";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";

export interface UserCollateralData {
  owner: PublicKey;
  market: PublicKey;
  collateralMint: PublicKey;
  depositedAmount: BN;
  lockedAmount: BN;
  bump: number;
}

export function useUserCollateral(_marketSymbol: MarketSymbol = "SOLHYPE") {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [data, setData] = useState<UserCollateralData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!publicKey) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      const collateralAddress = getUserCollateralPda(publicKey);
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
      
      const collateralAccount = await (program.account as any).userCollateral.fetch(collateralAddress);
      setData(collateralAccount as UserCollateralData);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    
    fetchData();

    if (!publicKey) return;
    const collateralAddress = getUserCollateralPda(publicKey);
    const subscriptionId = connection.onAccountChange(collateralAddress, () => fetchData(), "confirmed");
    const safetyTimer = setInterval(fetchData, 30_000);

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
      clearInterval(safetyTimer);
    };
  }, [connection, publicKey, fetchData]);

  const refetch = useCallback(() => {
    fetchData();
    setTimeout(fetchData, 1000);
    setTimeout(fetchData, 2500);
    setTimeout(fetchData, 5000);
  }, [fetchData]);

  const availableAmount = data
    ? data.depositedAmount.sub(data.lockedAmount)
    : new BN(0);

  return { data, loading, availableAmount, refetch };
}
