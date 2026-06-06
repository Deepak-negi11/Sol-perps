import * as anchor from "@coral-xyz/anchor";

const FEEDS = {
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  WBTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
} as const;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const idl = require("../solperp-anchor/target/idl/solperp_anchor.json");
const program = new anchor.Program(idl, provider);

for (const [symbol, feedHex] of Object.entries(FEEDS)) {
  const [market] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(feedHex, "hex")],
    program.programId,
  );
  const account = await program.account.market.fetch(market);
  const signature = await program.methods
    .updateMarketConfig(
      new anchor.BN(250),
      new anchor.BN(25),
      account.tradingFeesBps,
    )
    .accounts({ market, admin: provider.wallet.publicKey })
    .rpc();
  console.log(`${symbol}: 250x max, 0.25% maintenance margin ${signature}`);
}
