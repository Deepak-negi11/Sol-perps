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
  // Write instructions need the connected wallet as an Anchor signer. Returning
  // null keeps transaction buttons disabled until the wallet is ready.
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
  // Read-only program access is useful for account fetches because it does not
  // require a connected wallet.
  const { connection } = useConnection();

  return useMemo(() => {
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async <T extends Transaction | VersionedTransaction>(
        tx: T,
      ) => tx,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(
        txs: T[],
      ) => txs,
    };
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(idl as any, provider) as unknown as SolperpProgram;
  }, [connection]);
}
