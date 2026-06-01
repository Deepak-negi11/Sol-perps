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
            })
            .rpc();

        const marketAccount = await program.account.market.fetch(marketPda);

        assert.equal(marketAccount.admin.toString(), provider.publicKey.toString());
        assert.equal(marketAccount.maxLeverage.toString(), "10");
        assert.equal(marketAccount.liquidationThresholdBps.toString(), "500");
        assert.equal(marketAccount.tradingFeesBps.toString(), "10");
        assert.equal(marketAccount.bump, marketBump);

        console.log("Market PDA:", marketPda.toString());
        console.log("Max leverage:", marketAccount.maxLeverage.toString());
        console.log("Liquidation threshold bps:", marketAccount.liquidationThresholdBps.toString());
        console.log("Trading fee bps:", marketAccount.tradingFeesBps.toString());

    })

    it("Deposit collateral", async () => {
        const wallet = provider.wallet as any;

        const collateralMint = await createMint(
            provider.connection,
            wallet.payer,
            wallet.publicKey,
            null,
            6
        );

        const userTokenAccount = await createAccount(
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


        const [userCollateralPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("user_collateral"), wallet.publicKey.toBuffer()],
            program.programId
        );


        const [vaultAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault")],
            program.programId
        );

        const vaultTokenAccount = await getAssociatedTokenAddress(
            collateralMint,
            vaultAuthorityPda,
            true
        );

        
        const amount = new anchor.BN(100_000_000); // 100 tokens
        await program.methods
            .depositCollateral(amount)
            .accounts({
                user: wallet.publicKey,
                collateralMint: collateralMint,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        // 7. Verify user collateral state
        const userCollateralAccount = await program.account.userCollateral.fetch(userCollateralPda);
        assert.equal(userCollateralAccount.owner.toString(), wallet.publicKey.toString());
        assert.equal(userCollateralAccount.depositedAmount.toString(), amount.toString());
        assert.equal(userCollateralAccount.lockedAmount.toString(), "0");

        // 8. Verify vault token balance
        const vaultBalance = await provider.connection.getTokenAccountBalance(vaultTokenAccount);
        assert.equal(vaultBalance.value.amount, amount.toString());

        console.log("Deposit collateral success!");
        console.log("User Collateral PDA:", userCollateralPda.toString());
        console.log("Deposited Amount:", userCollateralAccount.depositedAmount.toString());
    });

})