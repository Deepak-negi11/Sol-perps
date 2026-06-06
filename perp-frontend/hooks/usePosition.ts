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
import type { MarketSymbol } from "@/lib/constants";

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
  // A wallet can now have multiple open position PDAs. `position` is kept as a
  // convenience for older components that still need one selected/default row.
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
      const provider = new AnchorProvider(connection, dummyWallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const program = new Program(idl as any, provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marketPda = getMarketPda(marketSymbol);
      const accounts = await (program.account as any).position.all([
        {
          memcmp: {
            offset: 8, // 8 bytes discriminator, followed by owner pubkey
            bytes: publicKey.toBase58(),
          },
        },
        {
          memcmp: {
            offset: 40, // discriminator + owner pubkey, followed by market pubkey
            bytes: marketPda.toBase58(),
          },
        },
      ]);
      const openPositions = accounts
        .map(
          (item: { publicKey: PublicKey; account: Omit<PositionData, "publicKey"> }) =>
            ({ publicKey: item.publicKey, ...item.account }) as PositionData,
        )
        .filter(
          (data: PositionData) =>
            data.isOpen && data.market.toString() === marketPda.toString(),
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
    // Polling is simple for devnet and catches updates caused by close,
    // liquidation, or future keeper execution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPosition();
    const interval = setInterval(fetchPosition, 5000);
    return () => clearInterval(interval);
  }, [fetchPosition]);

  const refetch = useCallback(() => {
    fetchPosition();
    setTimeout(fetchPosition, 1000);
    setTimeout(fetchPosition, 2500);
    setTimeout(fetchPosition, 5000);
  }, [fetchPosition]);

  return { position, positions, loading, refetch };
}
