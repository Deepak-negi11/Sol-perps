"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN, type Idl } from "@coral-xyz/anchor";
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

type UserCollateralAccountClient = {
  userCollateral: {
    fetch: (address: PublicKey) => Promise<UserCollateralData>;
  };
};

export function useUserCollateral(_marketSymbol: MarketSymbol = "SOLUSD") {
  void _marketSymbol;
  // User collateral is the wallet's deposit ledger inside the protocol. It is
  // different from the SPL token account that actually holds wallet USDC.
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
      // One shared USDC margin PDA backs positions across every market.
      const pda = getUserCollateralPda(publicKey);
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
      const program = new Program(idl as Idl, provider);
      const collateralAccount = program.account as unknown as UserCollateralAccountClient;
      const account = await collateralAccount.userCollateral.fetch(pda);
      setData(account);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void fetchData(), 0);
    if (!publicKey) {
      return () => window.clearTimeout(initialFetch);
    }

    const pda = getUserCollateralPda(publicKey);
    const subId = connection.onAccountChange(pda, () => fetchData(),
  "confirmed");
    const interval = setInterval(fetchData, 10_000)

   return () => {
        window.clearTimeout(initialFetch);
        connection.removeAccountChangeListener(subId);
        clearInterval(interval);
      };
    }, [connection, publicKey, fetchData]);

  const refetch = useCallback(() => {
    fetchData();
    setTimeout(fetchData, 1000);
    setTimeout(fetchData, 2500);
    setTimeout(fetchData, 5000);
  }, [fetchData]);

  // Available collateral is the free balance the user can withdraw or use for a
  // new order. Locked collateral backs open positions or pending trigger orders.
  const availableAmount = data
    ? data.depositedAmount.sub(data.lockedAmount)
    : new BN(0);

  return { data, loading, availableAmount, refetch };
}
