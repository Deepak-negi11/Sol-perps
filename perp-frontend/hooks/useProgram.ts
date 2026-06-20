"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import idl from "@/lib/idl/solperp_anchor.json";

export type SolperpProgram = Program;

export function useProgram(): SolperpProgram | null {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }

    const provider = new AnchorProvider(
      connection,
      {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
      { commitment: "confirmed" }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(idl as any, provider) as unknown as SolperpProgram;
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);
}

export function useReadonlyProgram(): SolperpProgram {
  const { connection } = useConnection();

  return useMemo(() => {
    const readonlyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async <T extends Transaction | VersionedTransaction>(
        tx: T,
      ) => tx,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(
        txs: T[],
      ) => txs,
    };
    const provider = new AnchorProvider(connection, readonlyWallet, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(idl as any, provider) as unknown as SolperpProgram;
  }, [connection]);
}
