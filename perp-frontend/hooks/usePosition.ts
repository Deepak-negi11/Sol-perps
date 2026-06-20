"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import idl from "@/lib/idl/solperp_anchor.json";
import {
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { getMarketPda } from "@/lib/pda";
import { PROGRAM_ID, type MarketSymbol } from "@/lib/constants";

export interface PositionData {
  publicKey: PublicKey;
  owner: PublicKey;
  market: PublicKey;
  positionId: BN;
  side: { long: object } | { short: object };
  collateral: BN;
  leverage: BN;
  positionSize: BN;
  entryPrice: BN;
  openedAt: BN;
  isOpen: boolean;
  bump: number;
}

export function usePosition(marketSymbol: MarketSymbol = "SOL") {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [position, setPosition] = useState<PositionData | null>(null);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosition = useCallback(async () => {
    if (!publicKey) {
      setPosition(null);
      setPositions([]);
      setLoading(false);
      return;
    }
    try {
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
      const provider = new AnchorProvider(connection, readonlyWallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(idl as any, provider);
      const marketAddress = getMarketPda(marketSymbol);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const positionAccounts = await (program.account as any).position.all([
        {
          memcmp: {
            offset: 8,
            bytes: publicKey.toBase58(),
          },
        },
        {
          memcmp: {
            offset: 40,
            bytes: marketAddress.toBase58(),
          },
        },
      ]);

      const openPositions = positionAccounts
        .map(
          (entry: { publicKey: PublicKey; account: Omit<PositionData, "publicKey"> }) =>
            ({ publicKey: entry.publicKey, ...entry.account }) as PositionData,
        )
        .filter(
          (item: PositionData) =>
            item.isOpen && item.market.toString() === marketAddress.toString(),
        )
        .sort((a: PositionData, b: PositionData) =>
          b.openedAt.sub(a.openedAt).toNumber(),
        );

      setPositions(openPositions);
      setPosition(openPositions[0] ?? null);
    } catch {
      setPosition(null);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [connection, marketSymbol, publicKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPosition();

    if (!publicKey) return;
    const marketAddress = getMarketPda(marketSymbol);
    const ownerAndMarketFilters = [
      { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      { memcmp: { offset: 40, bytes: marketAddress.toBase58() } },
    ];
    const subscriptionId = connection.onProgramAccountChange(
      PROGRAM_ID,
      () => fetchPosition(),
      "confirmed",
      ownerAndMarketFilters,
    );
    const safetyTimer = setInterval(fetchPosition, 30_000);

    return () => {
      connection.removeProgramAccountChangeListener(subscriptionId);
      clearInterval(safetyTimer);
    };
  }, [connection, marketSymbol, publicKey, fetchPosition]);

  const refetch = useCallback(() => {
    fetchPosition();
    setTimeout(fetchPosition, 1000);
    setTimeout(fetchPosition, 2500);
    setTimeout(fetchPosition, 5000);
  }, [fetchPosition]);

  return { position, positions, loading, refetch };
}
