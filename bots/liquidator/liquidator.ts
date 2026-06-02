import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import dotenv from "dotenv";

import { SolperpAnchor } from "../../solperp-anchor/target/types/solperp_anchor";
dotenv.config();

const MARKET_SEED = "market";

const USER_COLLATERAL_SEED = "user_collateral";
const BPS_DENOMINATOR = new anchor.BN(10_000);
const PRICE_DECIMALS = new anchor.BN(1_000_000);

const MANUAL_PRICE_OFFSET = 73;
const MANUAL_EXPONENT_OFFSET = 89;
const LOCAL_MOCK_PRICE_UPDATE = "22uBBYZwcKenxnRcn9tcH1hLWNsTfLJTJFvMJUvKqehY";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizePrice(price: bigint, exponent: number): anchor.BN {
    if (price <= 0n) {
        throw new Error(`Invalid oracle price: ${price.toString()}`);
    }

    const targetExponent = exponent + 6;
    const pow10 = (n: number) => 10n ** BigInt(n);

    let normalized: bigint;

    if (targetExponent >= 0) {
        normalized = price * pow10(targetExponent);
    } else {
        normalized = price / pow10(-targetExponent);
    }

    return new anchor.BN(normalized.toString());
}

function readManualPriceUpdate(accountData: Buffer): {
    rawPrice: bigint;
    exponent: number;
    normalizedPrice: anchor.BN;
} {
    if (accountData.length <= MANUAL_EXPONENT_OFFSET + 4) {
        throw new Error(`Price update account data is too short: ${accountData.length} bytes`);
    }

    const rawPrice = accountData.readBigInt64LE(MANUAL_PRICE_OFFSET);
    const exponent = accountData.readInt32LE(MANUAL_EXPONENT_OFFSET);
    const normalizedPrice = normalizePrice(rawPrice, exponent);

    return {
        rawPrice,
        exponent,
        normalizedPrice,
    };
}

function formatSixDecimalAmount(amount: anchor.BN): string {
    const whole = amount.div(PRICE_DECIMALS).toString();
    const fractional = amount.mod(PRICE_DECIMALS).toString().padStart(6, "0");
    return `${whole}.${fractional}`;
}

// Calculates PnL matching the smart contract's formula
function calculatePnL(
    side: any,
    positionSize: anchor.BN,
    entryPrice: anchor.BN,
    currentPrice: anchor.BN
): anchor.BN {
    const size = new anchor.BN(positionSize);
    const entry = new anchor.BN(entryPrice);
    const current = new anchor.BN(currentPrice);

    let priceDiff: anchor.BN;
    let isLoss = false;

    if (side.long) {
        if (current.gte(entry)) {
            priceDiff = current.sub(entry);
        } else {
            priceDiff = entry.sub(current);
            isLoss = true;
        }
    } else {
        if (entry.gte(current)) {
            priceDiff = entry.sub(current);
        } else {
            priceDiff = current.sub(entry);
            isLoss = true;
        }
    }

    const pnl = size.mul(priceDiff).div(entry);
    return isLoss ? pnl.neg() : pnl;
}

// Helper to determine remaining collateral
function calculateRemainingCollateral(collateral: anchor.BN, pnl: anchor.BN): anchor.BN {
    if (pnl.isNeg()) {
        const loss = pnl.abs();
        if (loss.gte(collateral)) {
            return new anchor.BN(0);
        }
        return collateral.sub(loss);
    } else {
        return collateral.add(pnl);
    }
}

async function runLiquidator() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const idl = require("../../solperp-anchor/target/idl/solperp_anchor.json");
    const program = new Program(idl, provider) as Program<SolperpAnchor>;
    const liquidator = provider.wallet.publicKey;

    const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(MARKET_SEED)],
        program.programId
    );

    console.log("--------------------------------------------------");
    console.log("Starting Liquidation Loop...");
    console.log("Liquidator Wallet:", liquidator.toString());
    console.log("Market PDA:", marketPda.toString());

    // Fetch market configuration
    const marketAccount = await program.account.market.fetch(marketPda);
    const feedId = marketAccount.priceFeedId;
    const thresholdBps = marketAccount.liquidationThresholdBps;

    // Determine Pyth Receiver Program ID (Mainnet vs Devnet)
    const isMainnet = provider.connection.rpcEndpoint.includes("mainnet") || provider.connection.rpcEndpoint.includes("api.mainnet");
    const pythProgramId = new anchor.web3.PublicKey(
        isMainnet
            ? "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
            : "HMHZhN31Q7ERSR2ekrPKbjqYc7icK7eqkoDZ6sEdHzv8"
    );

    // Best-effort PDA derivation for non-local environments.
    // For real production Pyth Receiver usage, replace this with the Hermes + receiver posting flow.
    const [priceUpdatePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("price_update_v2"), Buffer.from(feedId)],
        pythProgramId
    );

    let priceUpdate = priceUpdatePda;
    // For local testing, fallback to mock oracle accounts if specified
    if (process.env.MOCK_ORACLE_PUBKEY) {
        priceUpdate = new anchor.web3.PublicKey(process.env.MOCK_ORACLE_PUBKEY);
    } else if (provider.connection.rpcEndpoint.includes("127.0.0.1") || provider.connection.rpcEndpoint.includes("localhost")) {
        priceUpdate = new anchor.web3.PublicKey(LOCAL_MOCK_PRICE_UPDATE);
    }

    console.log("Monitoring Price Update Account:", priceUpdate.toString());

    while (true) {
        try {
            // 1. Fetch current price from the Pyth PriceUpdateV2 account
            const accountInfo = await provider.connection.getAccountInfo(priceUpdate);
            if (!accountInfo) {
                console.error("Error: Price update account not found on-chain!");
                await sleep(5000);
                continue;
            }

            const {
                rawPrice,
                exponent,
                normalizedPrice: currentPrice,
            } = readManualPriceUpdate(accountInfo.data);

            console.log(
                `\n[Price Update] Live price: $${formatSixDecimalAmount(currentPrice)} ` +
                `(raw=${rawPrice.toString()}, exponent=${exponent}, normalized=${currentPrice.toString()})`
            );

            // 2. Fetch all program position accounts
            const positions = await program.account.position.all();
            let openPositionsCount = 0;

            for (const item of positions) {
                const positionPda = item.publicKey;
                const position = item.account;

                if (!position.isOpen) {
                    continue;
                }
                openPositionsCount++;

                // 3. Perform off-chain liquidation check
                const pnl = calculatePnL(position.side, position.positionSize, position.entryPrice, currentPrice);
                const remainingCollateral = calculateRemainingCollateral(position.collateral, pnl);

                // Required margin = positionSize * thresholdBps / 10000
                const requiredMargin = position.positionSize.mul(thresholdBps).div(BPS_DENOMINATOR);

                const isLiquidatable = remainingCollateral.lte(requiredMargin);

                console.log(`  -> Position: ${positionPda.toString()}`);
                console.log(`     Owner: ${position.owner.toString()} | Side: ${position.side.long ? "Long" : "Short"}`);
                console.log(`     Collateral: ${position.collateral.toString()} | PnL: ${pnl.toString()}`);
                console.log(`     Remaining Collateral: ${remainingCollateral.toString()} | Required Margin: ${requiredMargin.toString()}`);
                console.log(`     Status: ${isLiquidatable ? " LIQUIDATABLE" : "HEALTHY"}`);

                if (isLiquidatable) {
                    console.log(`     Executing on-chain liquidation for ${positionPda.toString()}...`);
                    const [userCollateralPda] = anchor.web3.PublicKey.findProgramAddressSync(
                        [
                            Buffer.from(USER_COLLATERAL_SEED),
                            marketPda.toBuffer(),
                            position.owner.toBuffer(),
                        ],
                        program.programId
                    );

                    try {
                        const tx = await program.methods
                            .liquidatePosition()
                            .accounts({
                                market: marketPda,
                                userCollateral: userCollateralPda,
                                position: positionPda,
                                priceUpdate,
                                liquidator,
                            })
                            .rpc();
                        console.log(` Successfully liquidated! Tx: ${tx}`);
                    } catch (err: any) {
                        console.error(` On-chain execution failed:`, err.toString());
                    }
                }
            }

            if (openPositionsCount === 0) {
                console.log("  No active open positions found.");
            }

        } catch (err: any) {
            console.error("Error in loop:", err.toString());
        }

        // Sleep for 3 seconds before next iteration
        await sleep(3000);
    }
}

runLiquidator().catch((err) => {
    console.error("Fatal Error:", err);
    process.exit(1);
});