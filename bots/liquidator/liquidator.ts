import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HermesClient } from "@pythnetwork/hermes-client";
import {
  PythSolanaReceiver,
  type InstructionWithEphemeralSigners,
} from "@pythnetwork/pyth-solana-receiver";
import type {
  Connection,
  PublicKey,
  Signer,
  VersionedTransaction,
} from "@solana/web3.js";
import dotenv from "dotenv";

import { SolperpAnchor } from "../../solperp-anchor/target/types/solperp_anchor";

dotenv.config();

const MARKET_SEED = "market";
const USER_COLLATERAL_SEED = "user_collateral";
const POSITION_SEED = "position";
const BPS_DENOMINATOR = new anchor.BN(10_000);
const PRICE_DECIMALS = new anchor.BN(1_000_000);
const DEFAULT_HERMES_ENDPOINT = "https://hermes.pyth.network";
const PYTH_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = Number(
  process.env.PYTH_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS ?? 50_000,
);
const POLL_MS = Number(process.env.LIQUIDATOR_POLL_MS ?? 3_000);
const DRY_RUN = process.env.DRY_RUN === "true";

type PythReceiverWallet = ConstructorParameters<
  typeof PythSolanaReceiver
>[0]["wallet"];
interface SigningWallet {
  signAllTransactions<T extends VersionedTransaction>(txs: T[]): Promise<T[]>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function feedIdBytesToHex(feedId: ArrayLike<number>): `0x${string}` {
  const hex = Array.from(feedId)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

function normalizePrice(price: bigint, exponent: number): anchor.BN {
  if (price <= 0n) {
    throw new Error(`Invalid oracle price: ${price.toString()}`);
  }

  const targetExponent = exponent + 6;
  const pow10 = (n: number) => 10n ** BigInt(n);
  const normalized =
    targetExponent >= 0
      ? price * pow10(targetExponent)
      : price / pow10(-targetExponent);

  return new anchor.BN(normalized.toString());
}

function formatSixDecimalAmount(amount: anchor.BN): string {
  const isNegative = amount.isNeg();
  const absoluteAmount = isNegative ? amount.abs() : amount;
  const whole = absoluteAmount.div(PRICE_DECIMALS).toString();
  const fractional = absoluteAmount
    .mod(PRICE_DECIMALS)
    .toString()
    .padStart(6, "0");
  return `${isNegative ? "-" : ""}${whole}.${fractional}`;
}

function positionSideName(side: unknown): "Long" | "Short" {
  return side && typeof side === "object" && "long" in side ? "Long" : "Short";
}

function triggerConditionMet(
  condition: unknown,
  currentPrice: anchor.BN,
  triggerPrice: anchor.BN,
): boolean {
  return condition && typeof condition === "object" && "above" in condition
    ? currentPrice.gte(triggerPrice)
    : currentPrice.lte(triggerPrice);
}

function calculatePnL(
  side: unknown,
  positionSize: anchor.BN,
  entryPrice: anchor.BN,
  currentPrice: anchor.BN,
): anchor.BN {
  const isLong = positionSideName(side) === "Long";
  let priceDiff: anchor.BN;
  let isLoss = false;

  if (isLong) {
    if (currentPrice.gte(entryPrice)) {
      priceDiff = currentPrice.sub(entryPrice);
    } else {
      priceDiff = entryPrice.sub(currentPrice);
      isLoss = true;
    }
  } else if (entryPrice.gte(currentPrice)) {
    priceDiff = entryPrice.sub(currentPrice);
  } else {
    priceDiff = currentPrice.sub(entryPrice);
    isLoss = true;
  }

  const pnl = positionSize.mul(priceDiff).div(entryPrice);
  return isLoss ? pnl.neg() : pnl;
}

function calculateRemainingCollateral(
  collateral: anchor.BN,
  pnl: anchor.BN,
): anchor.BN {
  if (!pnl.isNeg()) {
    return collateral.add(pnl);
  }

  const loss = pnl.abs();
  return loss.gte(collateral) ? new anchor.BN(0) : collateral.sub(loss);
}

async function getFreshPythUpdate(feedIdHex: `0x${string}`): Promise<{
  currentPrice: anchor.BN;
  publishTime: number;
  priceUpdateData: string[];
}> {
  const hermes = new HermesClient(
    process.env.PYTH_HERMES_URL ?? DEFAULT_HERMES_ENDPOINT,
    process.env.PYTH_API_KEY
      ? { accessToken: process.env.PYTH_API_KEY }
      : undefined,
  );

  const priceUpdate = await hermes.getLatestPriceUpdates([feedIdHex], {
    encoding: "base64",
  });
  const priceUpdateData = priceUpdate.binary.data;
  const parsed = priceUpdate.parsed?.[0];

  if (!priceUpdateData.length || !parsed) {
    throw new Error(`Pyth did not return a price update for ${feedIdHex}`);
  }

  const rawPrice = BigInt(parsed.price.price);
  const exponent = Number(parsed.price.expo);

  return {
    currentPrice: normalizePrice(rawPrice, exponent),
    publishTime: Number(parsed.price.publish_time),
    priceUpdateData,
  };
}

async function sendVersionedTransactions(
  connection: Connection,
  wallet: SigningWallet,
  transactions: { tx: VersionedTransaction; signers?: Signer[] }[],
): Promise<string[]> {
  const txs = transactions.map(({ tx, signers = [] }) => {
    if (signers.length) tx.sign(signers);
    return tx;
  });
  const signedTxs = await wallet.signAllTransactions(txs);
  const signatures: string[] = [];

  for (const signedTx of signedTxs) {
    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      {
        maxRetries: 3,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      },
    );

    const status = await connection.confirmTransaction(signature, "confirmed");
    if (status.value.err) {
      const failedTx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const logs = failedTx?.meta?.logMessages?.join("\n") ?? "";
      throw new Error(
        `Transaction ${signature} failed: ${JSON.stringify(status.value.err)}${logs ? `\n${logs}` : ""}`,
      );
    }

    signatures.push(signature);
  }

  return signatures;
}

async function sendLiquidationsWithFreshPrice(params: {
  provider: anchor.AnchorProvider;
  feedIdHex: `0x${string}`;
  priceUpdateData: string[];
  buildInstructions: (
    priceUpdateAccount: PublicKey,
  ) => Promise<InstructionWithEphemeralSigners[]>;
}): Promise<string[]> {
  const pythReceiver = new PythSolanaReceiver({
    connection: params.provider.connection,
    wallet: params.provider.wallet as unknown as PythReceiverWallet,
  });
  const transactionBuilder = pythReceiver.newTransactionBuilder({
    closeUpdateAccounts: true,
  });

  await transactionBuilder.addPostPriceUpdates(params.priceUpdateData);
  await transactionBuilder.addPriceConsumerInstructions(
    async (getPriceUpdateAccount) =>
      params.buildInstructions(getPriceUpdateAccount(params.feedIdHex)),
  );

  const transactions = await transactionBuilder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: PYTH_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
    tightComputeBudget: true,
  });

  return sendVersionedTransactions(
    params.provider.connection,
    params.provider.wallet,
    transactions,
  );
}

async function runKeeper() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = require("../../solperp-anchor/target/idl/solperp_anchor.json");
  const program = new Program(idl, provider) as Program<SolperpAnchor>;
  const liquidator = provider.wallet.publicKey;

  console.log("--------------------------------------------------");
  console.log("Starting Sol-Perps Keeper");
  console.log("RPC:", provider.connection.rpcEndpoint);
  console.log("Liquidator wallet:", liquidator.toString());
  console.log("Program:", program.programId.toString());
  console.log("Dry run:", DRY_RUN ? "yes" : "no");

  while (true) {
    try {
      const markets = await program.account.market.all();
      for (const marketItem of markets) {
        const marketPda = marketItem.publicKey;
        const marketAccount = marketItem.account;
        const feedIdHex = feedIdBytesToHex(marketAccount.priceFeedId);
        const [expectedMarketPda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from(MARKET_SEED),
            Buffer.from(Array.from(marketAccount.priceFeedId)),
          ],
          program.programId,
        );
        if (!marketPda.equals(expectedMarketPda)) {
          console.log(`Skipping legacy market ${marketPda.toString()}`);
          continue;
        }

        const marketFilter = [
          {
            memcmp: {
              offset: 40,
              bytes: marketPda.toBase58(),
            },
          },
        ];
        const positions = await program.account.position.all(marketFilter);
        const orders = await program.account.triggerOrder.all(marketFilter);
        const thresholdBps = marketAccount.liquidationThresholdBps;
        const { currentPrice, publishTime, priceUpdateData } =
          await getFreshPythUpdate(feedIdHex);

        console.log(
          `\n[Market ${marketPda.toString()}] $${formatSixDecimalAmount(currentPrice)} publishTime=${publishTime}`,
        );

        const builders: Array<
          (priceUpdateAccount: PublicKey) => Promise<InstructionWithEphemeralSigners>
        > = [];

        for (const item of positions) {
          const position = item.account;
          if (!position.isOpen || !position.market.equals(marketPda)) continue;

          const pnl = calculatePnL(
            position.side,
            position.positionSize,
            position.entryPrice,
            currentPrice,
          );
          const remainingCollateral = calculateRemainingCollateral(
            position.collateral,
            pnl,
          );
          const requiredMargin = position.positionSize
            .mul(thresholdBps)
            .div(BPS_DENOMINATOR);
          const isLiquidatable = remainingCollateral.lte(requiredMargin);

          console.log(
            `  Position ${item.publicKey.toString()} margin=${formatSixDecimalAmount(remainingCollateral)} required=${formatSixDecimalAmount(requiredMargin)} ${isLiquidatable ? "LIQUIDATABLE" : "healthy"}`,
          );
          if (!isLiquidatable) continue;

          const [userCollateralPda] =
            anchor.web3.PublicKey.findProgramAddressSync(
              [
                Buffer.from(USER_COLLATERAL_SEED),
                position.owner.toBuffer(),
              ],
              program.programId,
            );

          builders.push(async (priceUpdateAccount) => ({
            instruction: await program.methods
              .liquidatePosition()
              .accounts({
                market: marketPda,
                userCollateral: userCollateralPda,
                position: item.publicKey,
                priceUpdate: priceUpdateAccount,
                liquidator,
              } as any)
              .instruction(),
            signers: [],
          }));
        }

        for (const item of orders) {
          const order = item.account;
          if (
            !order.isActive ||
            !order.market.equals(marketPda) ||
            !triggerConditionMet(
              order.triggerCondition,
              currentPrice,
              order.triggerPrice,
            )
          ) {
            continue;
          }

          const [userCollateralPda] =
            anchor.web3.PublicKey.findProgramAddressSync(
              [
                Buffer.from(USER_COLLATERAL_SEED),
                order.owner.toBuffer(),
              ],
              program.programId,
            );
          const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from(POSITION_SEED),
              marketPda.toBuffer(),
              order.owner.toBuffer(),
              order.positionId.toArrayLike(Buffer, "le", 8),
            ],
            program.programId,
          );

          console.log(
            `  Trigger order ${item.publicKey.toString()} is ready at $${formatSixDecimalAmount(order.triggerPrice)}`,
          );
          builders.push(async (priceUpdateAccount) => ({
            instruction: await program.methods
              .executeTriggerOrder(order.orderId)
              .accounts({
                market: marketPda,
                priceUpdate: priceUpdateAccount,
                owner: order.owner,
                userCollateral: userCollateralPda,
                position: positionPda,
                order: item.publicKey,
                executor: liquidator,
                systemProgram: anchor.web3.SystemProgram.programId,
              } as any)
              .instruction(),
            signers: [],
          }));
        }

        if (!builders.length) continue;
        if (DRY_RUN) {
          console.log(`  Dry run: would execute ${builders.length} action(s).`);
          continue;
        }

        // Send each action separately so one stale/invalid order cannot block
        // unrelated liquidations and trigger orders.
        for (const buildInstruction of builders) {
          try {
            const signatures = await sendLiquidationsWithFreshPrice({
              provider,
              feedIdHex,
              priceUpdateData,
              buildInstructions: async (priceUpdateAccount) => [
                await buildInstruction(priceUpdateAccount),
              ],
            });
            for (const signature of signatures) {
              console.log(`  Keeper tx confirmed: ${signature}`);
            }
          } catch (error) {
            console.error(
              "  Keeper action failed:",
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }
    } catch (err) {
      console.error(
        "Liquidator loop error:",
        err instanceof Error ? err.message : String(err),
      );
    }

    await sleep(POLL_MS);
  }
}

runKeeper().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
