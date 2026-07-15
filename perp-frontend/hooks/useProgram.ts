"use client";

/* ===========================================================================
 *  READING ORDER #9  ·  hooks/useProgram.ts
 *  WHAT IT IS: builds the "remote control" for your contract (an Anchor
 *  Program object). Every read/write to the chain goes through this.
 *
 *  WHAT A "hook" IS: a function whose name starts with use… that gives a
 *  component data and re-computes when its inputs change. The useMemo here
 *  means "only rebuild the Program when the wallet/connection changes", not on
 *  every single render (that would be wasteful).
 *
 *  TWO VERSIONS:
 *    - useProgram(): needs a connected wallet that can SIGN. Used to SEND
 *      transactions (open/close/deposit). Returns null until the wallet is
 *      ready, which safely keeps trade buttons disabled.
 *    - useReadonlyProgram(): uses a fake "dummy" wallet that cannot sign. Used
 *      only to READ accounts, so it works even with no wallet connected.
 *
 *  HOW IT'S BUILT: AnchorProvider(connection, wallet) + the IDL (your program's
 *  "menu" from lib/idl/) = a Program you call like program.methods.openPosition().
 *
 *  NEXT FILE TO READ -> hooks/usePythPrice.ts
 * =========================================================================== */
import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
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

    // The AnchorProvider connects the RPC node connection with the wallet's signing capability.
    // This allows the program client to automatically sign transactions when invoking instructions.
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
      { commitment: "confirmed" }
    );

    // Initializes the Anchor Program instance using the JSON IDL definition and the provider.
    // Casting to any avoids strict IDL type mismatches during compiling.
    return new Program(idl as Idl, provider) as unknown as SolperpProgram;
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
    return new Program(idl as Idl, provider) as unknown as SolperpProgram;
  }, [connection]);
}
