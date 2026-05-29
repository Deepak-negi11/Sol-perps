import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { SolperpAnchor } from "../../../target/types/solperp_anchor";
import { assert } from "chai";

describe("solperp-lab", () => {
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.SolperpAnchor as Program<SolperpAnchor>;
    const provider = anchor.getProvider();

    it("Initialize SOL-PERP market", async () => {
        const [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
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
        assert.equal(marketAccount.bump, 1);

        console.log("Market PDA:", marketPda.toString());
        console.log("Max leverage:", marketAccount.maxLeverage.toString());
        console.log("Liquidation threshold bps:", marketAccount.liquidationThresholdBps.toString());
        console.log("Trading fee bps:", marketAccount.tradingFeesBps.toString());

    })


})