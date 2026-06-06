import { PublicKey, SystemProgram, type VersionedTransaction } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import type { Signer, TransactionInstruction } from "@solana/web3.js";

export const TIP_ACCOUNTS: string[] = [];

export function getRandomTipAccount(): PublicKey {
  return PublicKey.default;
}

export function buildJitoTipInstruction(
  payer: PublicKey,
  lamports: number,
): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: payer,
    lamports,
  });
}

export async function sendTransactionsJito(
  transactions: { tx: VersionedTransaction; signers?: Signer[] }[],
  searcherClients: unknown,
  wallet: AnchorWallet,
): Promise<string> {
  void transactions;
  void searcherClients;
  void wallet;
  throw new Error("Jito sending is not used by this frontend");
}
