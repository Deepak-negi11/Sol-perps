"use client";

import { useCallback, useEffect, useState } from "react";
import { BN, BorshCoder, EventParser, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import idl from "@/lib/idl/solperp_anchor.json";
import {
  LEGACY_MARKET_PDA,
  PROGRAM_ID,
  type MarketSymbol,
} from "@/lib/constants";
import {
  getLegacyUserCollateralPda,
  getMarketPda,
  getUserCollateralPda,
} from "@/lib/pda";

export interface TradeHistoryItem {
  id: string;
  signature: string;
  blockTime: number;
  action: "Opened" | "Closed" | "Liquidated";
  isLong: boolean;
  price: number;
  collateral: number | null;
  size: number | null;
  leverage: number | null;
  pnl: number | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function bnToNumber(value: unknown): number {
  if (BN.isBN(value)) return (value as BN).toNumber();
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function publicKeyMatches(value: unknown, expected: PublicKey): boolean {
  if (value instanceof PublicKey) return value.equals(expected);
  return String(value) === expected.toString();
}

function isLongSide(value: unknown): boolean {
  const side = asRecord(value);
  return "long" in side || "Long" in side;
}

export function useTradeHistory(marketSymbol: MarketSymbol) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [history, setHistory] = useState<TradeHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!publicKey) {
      setHistory([]);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const sharedCollateral = getUserCollateralPda(publicKey);
      const legacyCollateral = getLegacyUserCollateralPda(
        publicKey,
        LEGACY_MARKET_PDA,
      );
      const addresses = [publicKey, sharedCollateral, legacyCollateral];
      const signatureGroups = await Promise.all(
        addresses.map((address) =>
          connection.getSignaturesForAddress(address, { limit: 25 }, "confirmed"),
        ),
      );
      const signatures = Array.from(
        new Set(signatureGroups.flat().map((item) => item.signature)),
      ).slice(0, 50);

      if (!signatures.length) {
        setHistory([]);
        setError(null);
        return;
      }

      const transactions = [];
      for (const signature of signatures) {
        transactions.push(
          await connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          }),
        );
      }
      const parser = new EventParser(PROGRAM_ID, new BorshCoder(idl as Idl));
      const selectedMarket = getMarketPda(marketSymbol);
      const items: TradeHistoryItem[] = [];

      transactions.forEach((transaction, transactionIndex) => {
        const logs = transaction?.meta?.logMessages;
        if (!transaction || !logs) return;

        let eventIndex = 0;
        for (const event of parser.parseLogs(logs)) {
          const normalizedName = event.name.toLowerCase();
          if (
            normalizedName !== "positionopened" &&
            normalizedName !== "positionclosed" &&
            normalizedName !== "positionliquidated"
          ) {
            continue;
          }

          const data = asRecord(event.data);
          if (!publicKeyMatches(data.user, publicKey)) continue;
          const isSelectedMarket = publicKeyMatches(data.market, selectedMarket);
          const isLegacySol =
            marketSymbol === "SOL" &&
            publicKeyMatches(data.market, LEGACY_MARKET_PDA);
          if (!isSelectedMarket && !isLegacySol) continue;

          const isOpened = normalizedName === "positionopened";
          const isClosed = normalizedName === "positionclosed";
          items.push({
            id: `${signatures[transactionIndex]}-${eventIndex}`,
            signature: signatures[transactionIndex],
            blockTime: transaction.blockTime ?? 0,
            action: isOpened
              ? "Opened"
              : isClosed
                ? "Closed"
                : "Liquidated",
            isLong: isLongSide(data.side),
            price:
              bnToNumber(
                data.entryPrice ?? data.exitPrice ?? data.currentPrice,
              ) / 1_000_000,
            collateral: isOpened
              ? bnToNumber(data.collateral) / 1_000_000
              : null,
            size: isOpened ? bnToNumber(data.positionSize) / 1_000_000 : null,
            leverage: isOpened ? bnToNumber(data.leverage) : null,
            pnl: isClosed
              ? bnToNumber(data.pnl) / 1_000_000
              : normalizedName === "positionliquidated"
                ? -(bnToNumber(data.realizedLoss) / 1_000_000)
                : null,
          });
          eventIndex += 1;
        }
      });

      items.sort((a, b) => b.blockTime - a.blockTime);
      setHistory(items);
      setError(null);
    } catch (caught) {
      setHistory([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [connection, marketSymbol, publicKey]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}
