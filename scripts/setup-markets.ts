import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "7oYnX6upn2jhobcxUoarHs7MyyiF7ieZgzMGcjfQhrrD",
);
const COLLATERAL_MINT = new anchor.web3.PublicKey(
  "AMdThvkbfjD3ynTLgG6kaTun2obhKyQ1ceqJN1pkTZPq",
);
const TARGET_POOL_BALANCE = new anchor.BN(100_000 * 1_000_000);
const FEEDS = {
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  WBTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
} as const;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const idl = require("../solperp-anchor/target/idl/solperp_anchor.json");
const program = new anchor.Program(idl, provider);
const admin = provider.wallet.publicKey;
const [vaultAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  PROGRAM_ID,
);
const adminTokenAccount = await getAssociatedTokenAddress(COLLATERAL_MINT, admin);
const vaultTokenAccount = await getAssociatedTokenAddress(
  COLLATERAL_MINT,
  vaultAuthority,
  true,
);

for (const [symbol, feedHex] of Object.entries(FEEDS)) {
  const feedBytes = Array.from(Buffer.from(feedHex, "hex"));
  const [market] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(feedBytes)],
    PROGRAM_ID,
  );

  let marketAccount;
  try {
    marketAccount = await program.account.market.fetch(market);
    console.log(`${symbol}: market already initialized at ${market.toString()}`);
  } catch {
    const signature = await program.methods
      .initializeMarket(
        new anchor.BN(250),
        new anchor.BN(25),
        new anchor.BN(10),
        feedBytes,
      )
      .accounts({
        market,
        admin,
        collateralMint: COLLATERAL_MINT,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log(`${symbol}: initialized ${signature}`);
    marketAccount = await program.account.market.fetch(market);
  }

  const poolBalance = marketAccount.poolBalance as anchor.BN;
  if (poolBalance.gte(TARGET_POOL_BALANCE)) {
    console.log(`${symbol}: pool already funded (${poolBalance.toString()})`);
    continue;
  }

  const amount = TARGET_POOL_BALANCE.sub(poolBalance);
  const signature = await program.methods
    .addLiquidity(amount)
    .accounts({
      market,
      vaultAuthority,
      collateralMint: COLLATERAL_MINT,
      adminTokenAccount,
      vaultTokenAccount,
      admin,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  console.log(`${symbol}: added ${amount.toString()} liquidity ${signature}`);
}
