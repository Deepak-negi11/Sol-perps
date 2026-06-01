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
            1_000_000_000 // 1000 tokens
        );

        // 4. Derive PDAs
        [userCollateralPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("user_collateral"), wallet.publicKey.toBuffer()],
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
        const [marketPda, marketBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("market")],
            program.programId
        );
        const maxLeverage = new anchor.BN(10);
        const liquidationThresholdBps = new anchor.BN(500);
        const tradingFeesBps = new anchor.BN(10);

        await program.methods
            .initializeMarket(
                maxLeverage,
                liquidationThresholdBps,
                tradingFeesBps
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
        const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("market")],
            program.programId
        );

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
        assert.equal(userBalance.value.amount, "940000000");

        console.log("Withdraw collateral success!");
        console.log("Remaining Deposited Amount in PDA:", userCollateralAccount.depositedAmount.toString());
    });
    it("Open Position", async () => {
        const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("market")],
            program.programId
        );

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
                leverage,
                entryPrice
            )
            .accounts({
                market: marketPda,
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
        const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("market")],
            program.programId
        );

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
            .closePosition(exitPrice)
            .accounts({
                market: marketPda,
                userCollateral: userCollateralPda,
                position: positionPda,
                user: wallet.publicKey,
            })
            .rpc();

        // 1. Verify user collateral state after close
        const userCollateralAccount = await program.account.userCollateral.fetch(userCollateralPda);
        assert.equal(userCollateralAccount.owner.toString(), wallet.publicKey.toString());
        assert.equal(userCollateralAccount.depositedAmount.toString(), "10000000"); // 60M initial - 50M realized loss
        assert.equal(userCollateralAccount.lockedAmount.toString(), "0"); // 50M initial - 50M collateral unlocked

        // 2. Verify position state
        const positionAccount = await program.account.position.fetch(positionPda);
        assert.equal(positionAccount.isOpen, false);

        console.log("Close position success!");
        console.log("Remaining Deposited Amount in PDA:", userCollateralAccount.depositedAmount.toString());
        console.log("Locked Amount in PDA:", userCollateralAccount.lockedAmount.toString());
    });
});