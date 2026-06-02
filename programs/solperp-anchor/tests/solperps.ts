import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { SolperpAnchor } from "../../../target/types/solperp_anchor";
import { assert } from "chai";
import {
    createMint,
    createAccount,
    mintTo,
    getAssociatedTokenAddress,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

describe("solperp-lab", () => {
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.SolperpAnchor as Program<SolperpAnchor>;
    const provider = anchor.getProvider();

    let collateralMint: anchor.web3.PublicKey;
    let userTokenAccount: anchor.web3.PublicKey;
    let vaultTokenAccount: anchor.web3.PublicKey;
    let userCollateralPda: anchor.web3.PublicKey;
    let vaultAuthorityPda: anchor.web3.PublicKey;
    let marketPda: anchor.web3.PublicKey;
    const wallet = provider.wallet as any;

    before(async () => {
        // 1. Create collateral mint
        collateralMint = await createMint(
            provider.connection,
            wallet.payer,
            wallet.publicKey,
            null,
            6
        );

        // 2. Create user token account
        userTokenAccount = await createAccount(
            provider.connection,
            wallet.payer,
            collateralMint,
            wallet.publicKey
        );

        await mintTo(
            provider.connection,
            wallet.payer,
            collateralMint,
            userTokenAccount,
            wallet.payer,
            2_000_000_000 // Mint 2000 tokens (enough for multiple tests)
        );

        // 3. Derive PDAs
        [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("market")],
            program.programId
        );

        [userCollateralPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("user_collateral"),
                marketPda.toBuffer(),
                wallet.publicKey.toBuffer()
            ],
            program.programId
        );

        [vaultAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault")],
            program.programId
        );

        vaultTokenAccount = await getAssociatedTokenAddress(
            collateralMint,
            vaultAuthorityPda,
            true
        );
    });

    it("Initialize SOL-PERP market", async () => {
        const [, marketBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("market")],
            program.programId
        );
        const maxLeverage = new anchor.BN(10);
        const liquidationThresholdBps = new anchor.BN(500);
        const tradingFeesBps = new anchor.BN(10);

        const priceFeedId = Array.from(Buffer.from("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b50d", "hex"));
        await program.methods
            .initializeMarket(
                maxLeverage,
                liquidationThresholdBps,
                tradingFeesBps,
                priceFeedId
            )
            .accounts({
                admin: provider.publicKey,
                collateralMint: collateralMint,
            })
            .rpc();

        const marketAccount = await program.account.market.fetch(marketPda);

        assert.equal(marketAccount.admin.toString(), provider.publicKey.toString());
        assert.equal(marketAccount.maxLeverage.toString(), "10");
        assert.equal(marketAccount.collateralMint.toString(), collateralMint.toString());
        assert.equal(marketAccount.liquidationThresholdBps.toString(), "500");
        assert.equal(marketAccount.tradingFeesBps.toString(), "10");
        assert.equal(marketAccount.bump, marketBump);

        console.log("Market PDA:", marketPda.toString());
        console.log("Max leverage:", marketAccount.maxLeverage.toString());
        console.log("Liquidation threshold bps:", marketAccount.liquidationThresholdBps.toString());
        console.log("Trading fee bps:", marketAccount.tradingFeesBps.toString());
    });

    it("Deposit collateral", async () => {
        const amount = new anchor.BN(100_000_000); // 100 tokens
        await program.methods
            .depositCollateral(amount)
            .accounts({
                market: marketPda,
                userCollateral: userCollateralPda,
                user: wallet.publicKey,
                collateralMint: collateralMint,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        // Verify user collateral state
        const userCollateralAccount = await program.account.userCollateral.fetch(userCollateralPda);
        assert.equal(userCollateralAccount.owner.toString(), wallet.publicKey.toString());
        assert.equal(userCollateralAccount.depositedAmount.toString(), amount.toString());
        assert.equal(userCollateralAccount.lockedAmount.toString(), "0");

        // Verify vault token balance
        const vaultBalance = await provider.connection.getTokenAccountBalance(vaultTokenAccount);
        assert.equal(vaultBalance.value.amount, amount.toString());

        console.log("Deposit collateral success!");
        console.log("User Collateral PDA:", userCollateralPda.toString());
        console.log("Deposited Amount:", userCollateralAccount.depositedAmount.toString());
    });

    it("Withdraw collateral", async () => {
        const withdrawAmount = new anchor.BN(40_000_000); // 40 tokens

        await program.methods
            .withdrawCollateral(withdrawAmount)
            .accounts({
                market: marketPda,
                userCollateral: userCollateralPda,
                user: wallet.publicKey,
                collateralMint: collateralMint,
                userCollateralTokenAccount: userTokenAccount,
                vaultAuthority: vaultAuthorityPda,
                vaultTokenAccount: vaultTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        const userCollateralAccount = await program.account.userCollateral.fetch(userCollateralPda);
        assert.equal(userCollateralAccount.owner.toString(), wallet.publicKey.toString());
        assert.equal(userCollateralAccount.depositedAmount.toString(), "60000000");
        assert.equal(userCollateralAccount.lockedAmount.toString(), "0");

        const vaultBalance = await provider.connection.getTokenAccountBalance(vaultTokenAccount);
        assert.equal(vaultBalance.value.amount, "60000000");

        const userBalance = await provider.connection.getTokenAccountBalance(userTokenAccount);
        assert.equal(userBalance.value.amount, "1940000000"); // 2000 initial - 100 deposit + 40 withdraw = 1940

        console.log("Withdraw collateral success!");
        console.log("Remaining Deposited Amount in PDA:", userCollateralAccount.depositedAmount.toString());
    });

    it("Open Position", async () => {
        const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("position"),
                marketPda.toBuffer(),
                wallet.publicKey.toBuffer()
            ],
            program.programId
        );

        const collateral = new anchor.BN(50_000_000); // 50 tokens (user has 60 tokens available)
        const leverage = new anchor.BN(10);
        const entryPrice = new anchor.BN(1000);
        const side = { long: {} };

        await program.methods
            .openPosition(
                side,
                collateral,
                leverage
            )
            .accounts({
                market: marketPda,
                priceUpdate: new anchor.web3.PublicKey("BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"),
                userCollateral: userCollateralPda,
                position: positionPda,
                user: wallet.publicKey,
            })
            .rpc();

        // 1. Verify user collateral state
        const userCollateralAccount = await program.account.userCollateral.fetch(userCollateralPda);
        assert.equal(userCollateralAccount.owner.toString(), wallet.publicKey.toString());
        assert.equal(userCollateralAccount.depositedAmount.toString(), "60000000");
        assert.equal(userCollateralAccount.lockedAmount.toString(), collateral.toString());

        // 2. Verify position state
        const positionAccount = await program.account.position.fetch(positionPda);
        assert.equal(positionAccount.owner.toString(), wallet.publicKey.toString());
        assert.equal(positionAccount.market.toString(), marketPda.toString());
        assert.deepEqual(positionAccount.side, side);
        assert.equal(positionAccount.collateral.toString(), collateral.toString());
        assert.equal(positionAccount.leverage.toString(), leverage.toString());
        assert.equal(positionAccount.positionSize.toString(), collateral.mul(leverage).toString());
        assert.equal(positionAccount.entryPrice.toString(), entryPrice.toString());
        assert.equal(positionAccount.isOpen, true);

        console.log("Open position success!");
        console.log("Position PDA:", positionPda.toString());
        console.log("Locked Amount in user collateral PDA:", userCollateralAccount.lockedAmount.toString());
    });

    it("Close Position (Realizing a Loss)", async () => {
        const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("position"),
                marketPda.toBuffer(),
                wallet.publicKey.toBuffer()
            ],
            program.programId
        );

        const exitPrice = new anchor.BN(900); // 10% price drop results in 100% loss of 50 tokens collateral due to 10x leverage

        await program.methods
            .closePosition()
            .accounts({
                market: marketPda,
                userCollateral: userCollateralPda,
                position: positionPda,
                priceUpdate: new anchor.web3.PublicKey("C11dmJTHfjc3AizfTBpnU3DaPvFfywbEZpnN2dKPbU6r"),
                user: wallet.publicKey,
            })
            .rpc();

        const userCollateralAccount = await program.account.userCollateral.fetch(userCollateralPda);
        assert.equal(userCollateralAccount.owner.toString(), wallet.publicKey.toString());
        assert.equal(userCollateralAccount.depositedAmount.toString(), "10000000"); // 60M initial - 50M realized loss
        assert.equal(userCollateralAccount.lockedAmount.toString(), "0"); // 50M initial - 50M collateral unlocked
        console.log(userCollateralAccount.lockedAmount)

        const positionAccount = await program.account.position.fetch(positionPda);
        assert.equal(positionAccount.isOpen, false);

        console.log("Close position success!");
        console.log("Remaining Deposited Amount in PDA:", userCollateralAccount.depositedAmount.toString());
        console.log("Locked Amount in PDA:", userCollateralAccount.lockedAmount.toString());
    });

    it("Liquidate Position", async () => {
        const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("position"),
                marketPda.toBuffer(),
                wallet.publicKey.toBuffer()
            ],
            program.programId
        );

        // 1. Deposit 100M tokens more to enable opening a new position (current balance is 10M)
        const depositAmount = new anchor.BN(100_000_000);
        await program.methods
            .depositCollateral(depositAmount)
            .accounts({
                market: marketPda,
                userCollateral: userCollateralPda,
                user: wallet.publicKey,
                collateralMint: collateralMint,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        // 2. Open a new long position (collateral: 50M, entry price: 1000, leverage: 10x)
        const collateral = new anchor.BN(50_000_000);
        const leverage = new anchor.BN(10);
        const entryPrice = new anchor.BN(1000);
        const side = { long: {} };

        await program.methods
            .openPosition(
                side,
                collateral,
                leverage
            )
            .accounts({
                market: marketPda,
                priceUpdate: new anchor.web3.PublicKey("BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"),
                userCollateral: userCollateralPda,
                position: positionPda,
                user: wallet.publicKey,
            })
            .rpc();


        await program.methods
            .liquidatePosition()
            .accounts({
                market: marketPda,
                userCollateral: userCollateralPda,
                position: positionPda,
                priceUpdate: new anchor.web3.PublicKey("22uBBYZwcKenxnRcn9tcH1hLWNsTfLJTJFvMJUvKqehY"),
                liquidator: wallet.publicKey,
            })
            .rpc();


        const userCollateralAccount = await program.account.userCollateral.fetch(userCollateralPda);
        assert.equal(userCollateralAccount.depositedAmount.toString(), "80000000");
        assert.equal(userCollateralAccount.lockedAmount.toString(), "0");

        const positionAccount = await program.account.position.fetch(positionPda);
        assert.equal(positionAccount.isOpen, false);

        console.log("Liquidation position success!");
        console.log("Remaining Deposited Amount in PDA:", userCollateralAccount.depositedAmount.toString());
        console.log("Locked Amount in PDA:", userCollateralAccount.lockedAmount.toString());
    });

    it("Admin can pause market", async () => {
        await program.methods
            .pauseMarket()
            .accounts({
                market: marketPda,
                admin: wallet.publicKey,
            })
            .rpc();

        const marketAccount = await program.account.market.fetch(marketPda);
        assert.equal(marketAccount.isPaused, true);
        console.log("Market paused successfully!");
    });

    it("open_position fails when paused", async () => {
        const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("position"),
                marketPda.toBuffer(),
                wallet.publicKey.toBuffer()
            ],
            program.programId
        );

        const collateral = new anchor.BN(10_000_000);
        const leverage = new anchor.BN(5);
        const side = { long: {} };

        try {
            await program.methods
                .openPosition(
                    side,
                    collateral,
                    leverage
                )
                .accounts({
                    market: marketPda,
                    priceUpdate: new anchor.web3.PublicKey("BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"),
                    userCollateral: userCollateralPda,
                    position: positionPda,
                    user: wallet.publicKey,
                })
                .rpc();
            assert.fail("Should have failed to open position when market is paused");
        } catch (err: any) {
            assert.include(err.toString(), "Market is paused");
            console.log("Successfully failed to open position on paused market!");
        }
    });

    it("Admin can resume market", async () => {
        await program.methods
            .resumeMarket()
            .accounts({
                market: marketPda,
                admin: wallet.publicKey,
            })
            .rpc();

        const marketAccount = await program.account.market.fetch(marketPda);
        assert.equal(marketAccount.isPaused, false);
        console.log("Market resumed successfully!");
    });

    it("Admin can update max leverage", async () => {
        const newMaxLeverage = new anchor.BN(8);
        const liquidationThresholdBps = new anchor.BN(500);
        const tradingFeesBps = new anchor.BN(10);

        await program.methods
            .updateMarketConfig(
                newMaxLeverage,
                liquidationThresholdBps,
                tradingFeesBps
            )
            .accounts({
                market: marketPda,
                admin: wallet.publicKey,
            })
            .rpc();

        const marketAccount = await program.account.market.fetch(marketPda);
        assert.equal(marketAccount.maxLeverage.toString(), "8");
        console.log("Max leverage updated to 8!");
    });

    it("open_position with leverage above max fails", async () => {
        const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("position"),
                marketPda.toBuffer(),
                wallet.publicKey.toBuffer()
            ],
            program.programId
        );

        const collateral = new anchor.BN(10_000_000);
        const leverage = new anchor.BN(10); // 10x is above current max of 8x
        const side = { long: {} };

        try {
            await program.methods
                .openPosition(
                    side,
                    collateral,
                    leverage
                )
                .accounts({
                    market: marketPda,
                    priceUpdate: new anchor.web3.PublicKey("BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"),
                    userCollateral: userCollateralPda,
                    position: positionPda,
                    user: wallet.publicKey,
                })
                .rpc();
            assert.fail("Should have failed to open position with leverage above max");
        } catch (err: any) {
            assert.include(err.toString(), "Invalid leverage");
            console.log("Successfully failed to open position with leverage above max!");
        }
    });
});