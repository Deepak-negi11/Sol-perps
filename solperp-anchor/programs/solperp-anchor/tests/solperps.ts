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
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
        wallet.publicKey.toBuffer(),
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
    const maxLeverage = new anchor.BN(100);
    const liquidationThresholdBps = new anchor.BN(500);
    const tradingFeesBps = new anchor.BN(10);

    const priceFeedId = Array.from(
      Buffer.from(
        "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b50d",
        "hex"
      )
    );
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
    assert.equal(marketAccount.maxLeverage.toString(), "100");
    assert.equal(
      marketAccount.collateralMint.toString(),
      collateralMint.toString()
    );
    assert.equal(marketAccount.liquidationThresholdBps.toString(), "500");
    assert.equal(marketAccount.tradingFeesBps.toString(), "10");
    assert.equal(marketAccount.poolBalance.toString(), "0");
    assert.equal(marketAccount.openInterestLong.toString(), "0");
    assert.equal(marketAccount.openInterestShort.toString(), "0");
    assert.equal(marketAccount.bump, marketBump);

    console.log("Market PDA:", marketPda.toString());
    console.log("Max leverage:", marketAccount.maxLeverage.toString());
    console.log(
      "Liquidation threshold bps:",
      marketAccount.liquidationThresholdBps.toString()
    );
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
    const userCollateralAccount = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    assert.equal(
      userCollateralAccount.owner.toString(),
      wallet.publicKey.toString()
    );
    assert.equal(
      userCollateralAccount.depositedAmount.toString(),
      amount.toString()
    );
    assert.equal(userCollateralAccount.lockedAmount.toString(), "0");

    // Verify vault token balance
    const vaultBalance = await provider.connection.getTokenAccountBalance(
      vaultTokenAccount
    );
    assert.equal(vaultBalance.value.amount, amount.toString());

    console.log("Deposit collateral success!");
    console.log("User Collateral PDA:", userCollateralPda.toString());
    console.log(
      "Deposited Amount:",
      userCollateralAccount.depositedAmount.toString()
    );
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

    const userCollateralAccount = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    assert.equal(
      userCollateralAccount.owner.toString(),
      wallet.publicKey.toString()
    );
    assert.equal(userCollateralAccount.depositedAmount.toString(), "60000000");
    assert.equal(userCollateralAccount.lockedAmount.toString(), "0");

    const vaultBalance = await provider.connection.getTokenAccountBalance(
      vaultTokenAccount
    );
    assert.equal(vaultBalance.value.amount, "60000000");

    const userBalance = await provider.connection.getTokenAccountBalance(
      userTokenAccount
    );
    assert.equal(userBalance.value.amount, "1940000000"); // 2000 initial - 100 deposit + 40 withdraw = 1940

    console.log("Withdraw collateral success!");
    console.log(
      "Remaining Deposited Amount in PDA:",
      userCollateralAccount.depositedAmount.toString()
    );
  });

  it("Open Position", async () => {
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    const collateral = new anchor.BN(50_000_000); // 50 tokens (user has 60 tokens available)
    const leverage = new anchor.BN(10);
    const entryPrice = new anchor.BN(1000);
    const side = { long: {} };

    await program.methods
      .openPosition(side, collateral, leverage)
      .accounts({
        market: marketPda,
        priceUpdate: new anchor.web3.PublicKey(
          "BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"
        ),
        userCollateral: userCollateralPda,
        position: positionPda,
        user: wallet.publicKey,
      })
      .rpc();

    // 1. Verify user collateral state
    const userCollateralAccount = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    assert.equal(
      userCollateralAccount.owner.toString(),
      wallet.publicKey.toString()
    );
    assert.equal(userCollateralAccount.depositedAmount.toString(), "59950000"); // 60M - 50k trading fee (10 bps of 50M)
    assert.equal(userCollateralAccount.lockedAmount.toString(), "49950000"); // 50M - 50k trading fee

    // 2. Verify position state
    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.owner.toString(), wallet.publicKey.toString());
    assert.equal(positionAccount.market.toString(), marketPda.toString());
    assert.deepEqual(positionAccount.side, side);
    assert.equal(positionAccount.collateral.toString(), "49950000");
    assert.equal(positionAccount.leverage.toString(), leverage.toString());
    assert.equal(positionAccount.positionSize.toString(), "499500000");
    assert.equal(positionAccount.entryPrice.toString(), entryPrice.toString());
    assert.equal(positionAccount.isOpen, true);

    const marketAccount = await program.account.market.fetch(marketPda);
    assert.equal(marketAccount.openInterestLong.toString(), "499500000");
    assert.equal(marketAccount.openInterestShort.toString(), "0");

    console.log("Open position success!");
    console.log("Position PDA:", positionPda.toString());
    console.log(
      "Locked Amount in user collateral PDA:",
      userCollateralAccount.lockedAmount.toString()
    );
  });

  it("Close Position (Realizing a Loss)", async () => {
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
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
        priceUpdate: new anchor.web3.PublicKey(
          "C11dmJTHfjc3AizfTBpnU3DaPvFfywbEZpnN2dKPbU6r"
        ),
        user: wallet.publicKey,
      })
      .rpc();

    const userCollateralAccount = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    assert.equal(
      userCollateralAccount.owner.toString(),
      wallet.publicKey.toString()
    );
    assert.equal(userCollateralAccount.depositedAmount.toString(), "10000000"); // 60M initial - 50M realized loss
    assert.equal(userCollateralAccount.lockedAmount.toString(), "0"); // 50M initial - 50M collateral unlocked
    console.log(userCollateralAccount.lockedAmount);

    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.isOpen, false);
    const marketAccount = await program.account.market.fetch(marketPda);
    assert.equal(marketAccount.openInterestLong.toString(), "0");

    console.log("Close position success!");
    console.log(
      "Remaining Deposited Amount in PDA:",
      userCollateralAccount.depositedAmount.toString()
    );
    console.log(
      "Locked Amount in PDA:",
      userCollateralAccount.lockedAmount.toString()
    );
  });

  it("Liquidate Position", async () => {
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
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
      .openPosition(side, collateral, leverage)
      .accounts({
        market: marketPda,
        priceUpdate: new anchor.web3.PublicKey(
          "BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"
        ),
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
        priceUpdate: new anchor.web3.PublicKey(
          "22uBBYZwcKenxnRcn9tcH1hLWNsTfLJTJFvMJUvKqehY"
        ),
        liquidator: wallet.publicKey,
      })
      .rpc();

    const userCollateralAccount = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    assert.equal(userCollateralAccount.depositedAmount.toString(), "79980000"); // 110M - 50k open fee - 29.97M realized loss
    assert.equal(userCollateralAccount.lockedAmount.toString(), "0");

    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.isOpen, false);
    const marketAccount = await program.account.market.fetch(marketPda);
    assert.equal(marketAccount.openInterestLong.toString(), "0");

    console.log("Liquidation position success!");
    console.log(
      "Remaining Deposited Amount in PDA:",
      userCollateralAccount.depositedAmount.toString()
    );
    console.log(
      "Locked Amount in PDA:",
      userCollateralAccount.lockedAmount.toString()
    );
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
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    const collateral = new anchor.BN(10_000_000);
    const leverage = new anchor.BN(5);
    const side = { long: {} };

    try {
      await program.methods
        .openPosition(side, collateral, leverage)
        .accounts({
          market: marketPda,
          priceUpdate: new anchor.web3.PublicKey(
            "BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"
          ),
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
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    const collateral = new anchor.BN(10_000_000);
    const leverage = new anchor.BN(10); // 10x is above current max of 8x
    const side = { long: {} };

    try {
      await program.methods
        .openPosition(side, collateral, leverage)
        .accounts({
          market: marketPda,
          priceUpdate: new anchor.web3.PublicKey(
            "BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"
          ),
          userCollateral: userCollateralPda,
          position: positionPda,
          user: wallet.publicKey,
        })
        .rpc();
      assert.fail(
        "Should have failed to open position with leverage above max"
      );
    } catch (err: any) {
      assert.include(err.toString(), "Invalid leverage");
      console.log(
        "Successfully failed to open position with leverage above max!"
      );
    }
  });

  it("Admin can withdraw protocol fees", async () => {
    const adminTokenAccount = await getAssociatedTokenAddress(
      collateralMint,
      wallet.publicKey
    );

    // Fetch initial state
    const marketBefore = await program.account.market.fetch(marketPda);
    const vaultBalanceBefore = await provider.connection.getTokenAccountBalance(
      vaultTokenAccount
    );
    const adminBalanceBefore = await provider.connection.getTokenAccountBalance(
      adminTokenAccount
    );

    // Assert we have collected fees (50,000 from openPosition and 50,000 from second openPosition)
    assert.equal(marketBefore.totalTradingFeesCollected.toString(), "100000");

    const withdrawAmount = new anchor.BN(50_000);

    // Perform withdrawal
    await program.methods
      .withdrawProtocolFees(withdrawAmount)
      .accounts({
        market: marketPda,
        vaultAuthority: vaultAuthorityPda,
        collateralMint: collateralMint,
        vaultTokenAccount: vaultTokenAccount,
        adminTokenAccount: adminTokenAccount,
        admin: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify state updates
    const marketAfter = await program.account.market.fetch(marketPda);
    assert.equal(marketAfter.totalTradingFeesCollected.toString(), "50000");

    const vaultBalanceAfter = await provider.connection.getTokenAccountBalance(
      vaultTokenAccount
    );
    const expectedVaultBalance = new anchor.BN(
      vaultBalanceBefore.value.amount
    ).sub(withdrawAmount);
    assert.equal(
      vaultBalanceAfter.value.amount,
      expectedVaultBalance.toString()
    );

    const adminBalanceAfter = await provider.connection.getTokenAccountBalance(
      adminTokenAccount
    );
    const expectedAdminBalance = new anchor.BN(
      adminBalanceBefore.value.amount
    ).add(withdrawAmount);
    assert.equal(
      adminBalanceAfter.value.amount,
      expectedAdminBalance.toString()
    );

    console.log("Protocol fees successfully withdrawn by admin!");
  });

  it("Non-admin cannot withdraw protocol fees", async () => {
    const nonAdmin = anchor.web3.Keypair.generate();

    // Airdrop some SOL to nonAdmin so they can sign the transaction
    const airdropSig = await provider.connection.requestAirdrop(
      nonAdmin.publicKey,
      1_000_000_000
    );
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: airdropSig,
    });

    const nonAdminTokenAccount = await getAssociatedTokenAddress(
      collateralMint,
      nonAdmin.publicKey
    );

    try {
      await program.methods
        .withdrawProtocolFees(new anchor.BN(10_000))
        .accounts({
          market: marketPda,
          vaultAuthority: vaultAuthorityPda,
          collateralMint: collateralMint,
          vaultTokenAccount: vaultTokenAccount,
          adminTokenAccount: nonAdminTokenAccount,
          admin: nonAdmin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([nonAdmin])
        .rpc();
      assert.fail(
        "Should have failed to withdraw protocol fees with non-admin signer"
      );
    } catch (err: any) {
      assert.include(
        err.toString(),
        "Only market admin can perform this action"
      );
      console.log(
        "Successfully failed to withdraw protocol fees with non-admin signer!"
      );
    }
  });

  it("Admin cannot withdraw more than total_trading_fees_collected", async () => {
    const adminTokenAccount = await getAssociatedTokenAddress(
      collateralMint,
      wallet.publicKey
    );

    // Currently remaining fees collected = 50,000. Try to withdraw 60,000.
    const invalidWithdrawAmount = new anchor.BN(60_000);

    try {
      await program.methods
        .withdrawProtocolFees(invalidWithdrawAmount)
        .accounts({
          market: marketPda,
          vaultAuthority: vaultAuthorityPda,
          collateralMint: collateralMint,
          vaultTokenAccount: vaultTokenAccount,
          adminTokenAccount: adminTokenAccount,
          admin: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail(
        "Should have failed to withdraw amount greater than total trading fees collected"
      );
    } catch (err: any) {
      assert.include(err.toString(), "Insufficient available collateral");
      console.log(
        "Successfully failed to withdraw more than total trading fees collected!"
      );
    }
  });

  it("Admin cannot withdraw zero fees", async () => {
    const adminTokenAccount = await getAssociatedTokenAddress(
      collateralMint,
      wallet.publicKey
    );

    try {
      await program.methods
        .withdrawProtocolFees(new anchor.BN(0))
        .accounts({
          market: marketPda,
          vaultAuthority: vaultAuthorityPda,
          collateralMint: collateralMint,
          vaultTokenAccount: vaultTokenAccount,
          adminTokenAccount: adminTokenAccount,
          admin: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have failed to withdraw zero fees");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "Withdraw amount must be greater than zero"
      );
      console.log("Successfully failed to withdraw zero fees!");
    }
  });

  it("Admin can add and remove pool liquidity", async () => {
    const marketBefore = await program.account.market.fetch(marketPda);
    const vaultBalanceBefore = await provider.connection.getTokenAccountBalance(
      vaultTokenAccount
    );
    const addAmount = new anchor.BN(100_000_000);
    const removeAmount = new anchor.BN(20_000_000);

    await program.methods
      .addLiquidity(addAmount)
      .accounts({
        market: marketPda,
        vaultAuthority: vaultAuthorityPda,
        collateralMint,
        adminTokenAccount: userTokenAccount,
        vaultTokenAccount,
        admin: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const marketAfterAdd = await program.account.market.fetch(marketPda);
    assert.equal(
      marketAfterAdd.poolBalance.toString(),
      marketBefore.poolBalance.add(addAmount).toString()
    );

    const vaultBalanceAfterAdd =
      await provider.connection.getTokenAccountBalance(vaultTokenAccount);
    assert.equal(
      vaultBalanceAfterAdd.value.amount,
      new anchor.BN(vaultBalanceBefore.value.amount).add(addAmount).toString()
    );

    await program.methods
      .removeLiquidity(removeAmount)
      .accounts({
        market: marketPda,
        vaultAuthority: vaultAuthorityPda,
        collateralMint,
        vaultTokenAccount,
        adminTokenAccount: userTokenAccount,
        admin: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const marketAfterRemove = await program.account.market.fetch(marketPda);
    assert.equal(
      marketAfterRemove.poolBalance.toString(),
      marketAfterAdd.poolBalance.sub(removeAmount).toString()
    );

    const vaultBalanceAfterRemove =
      await provider.connection.getTokenAccountBalance(vaultTokenAccount);
    assert.equal(
      vaultBalanceAfterRemove.value.amount,
      new anchor.BN(vaultBalanceAfterAdd.value.amount)
        .sub(removeAmount)
        .toString()
    );

    console.log("Pool liquidity add/remove success!");
  });

  it("Admin cannot remove more than pool balance", async () => {
    const market = await program.account.market.fetch(marketPda);
    const tooMuch = market.poolBalance.add(new anchor.BN(1));

    try {
      await program.methods
        .removeLiquidity(tooMuch)
        .accounts({
          market: marketPda,
          vaultAuthority: vaultAuthorityPda,
          collateralMint,
          vaultTokenAccount,
          adminTokenAccount: userTokenAccount,
          admin: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have failed to remove more than pool balance");
    } catch (err: any) {
      assert.include(err.toString(), "Insufficient pool balance");
      console.log("Successfully failed to remove more than pool balance!");
    }
  });

  function getOrderPda(orderId: anchor.BN) {
    const orderIdBuffer = Buffer.alloc(8);
    orderIdBuffer.writeBigUInt64LE(BigInt(orderId.toString()));
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
        orderIdBuffer,
      ],
      program.programId
    )[0];
  }

  it("User can place and cancel a limit order", async () => {
    const market = await program.account.market.fetch(marketPda);
    const orderId = market.nextOrderId;
    const orderPda = getOrderPda(orderId);
    const collateral = new anchor.BN(5_000_000);
    const leverage = new anchor.BN(2);
    const triggerPrice = new anchor.BN(1_000_000_000);
    const userCollateralBefore = await program.account.userCollateral.fetch(
      userCollateralPda
    );

    await program.methods
      .placeLimitOrder(
        orderId,
        { long: {} },
        collateral,
        leverage,
        triggerPrice,
        { below: {} }
      )
      .accounts({
        market: marketPda,
        userCollateral: userCollateralPda,
        order: orderPda,
        user: wallet.publicKey,
      })
      .rpc();

    const order = await program.account.triggerOrder.fetch(orderPda);
    assert.equal(order.isActive, true);
    assert.deepEqual(order.orderType, { limit: {} });

    const userCollateralAfterPlace =
      await program.account.userCollateral.fetch(userCollateralPda);
    assert.equal(
      userCollateralAfterPlace.lockedAmount.toString(),
      userCollateralBefore.lockedAmount.add(collateral).toString()
    );

    await program.methods
      .cancelTriggerOrder(orderId)
      .accounts({
        market: marketPda,
        userCollateral: userCollateralPda,
        order: orderPda,
        user: wallet.publicKey,
      })
      .rpc();

    const userCollateralAfterCancel =
      await program.account.userCollateral.fetch(userCollateralPda);
    assert.equal(
      userCollateralAfterCancel.lockedAmount.toString(),
      userCollateralBefore.lockedAmount.toString()
    );

    console.log("Limit order place/cancel success!");
  });

  it("Keeper can execute a triggered limit order", async () => {
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );
    const market = await program.account.market.fetch(marketPda);
    const orderId = market.nextOrderId;
    const orderPda = getOrderPda(orderId);
    const collateral = new anchor.BN(10_000_000);
    const leverage = new anchor.BN(2);
    const triggerPrice = new anchor.BN(1_000_000_000);

    await program.methods
      .placeLimitOrder(
        orderId,
        { long: {} },
        collateral,
        leverage,
        triggerPrice,
        { below: {} }
      )
      .accounts({
        market: marketPda,
        userCollateral: userCollateralPda,
        order: orderPda,
        user: wallet.publicKey,
      })
      .rpc();

    await program.methods
      .executeTriggerOrder(orderId)
      .accounts({
        market: marketPda,
        priceUpdate: new anchor.web3.PublicKey(
          "BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"
        ),
        owner: wallet.publicKey,
        userCollateral: userCollateralPda,
        position: positionPda,
        order: orderPda,
        executor: wallet.publicKey,
      })
      .rpc();

    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.isOpen, true);
    assert.deepEqual(positionAccount.side, { long: {} });
    assert.equal(positionAccount.leverage.toString(), "2");

    await program.methods
      .closePosition()
      .accounts({
        market: marketPda,
        userCollateral: userCollateralPda,
        position: positionPda,
        priceUpdate: new anchor.web3.PublicKey(
          "C11dmJTHfjc3AizfTBpnU3DaPvFfywbEZpnN2dKPbU6r"
        ),
        user: wallet.publicKey,
      })
      .rpc();

    console.log("Triggered limit order executed!");
  });

  it("Keeper can execute a triggered stop-loss order", async () => {
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );
    const collateral = new anchor.BN(10_000_000);
    const leverage = new anchor.BN(2);

    await program.methods
      .openPosition({ long: {} }, collateral, leverage)
      .accounts({
        market: marketPda,
        priceUpdate: new anchor.web3.PublicKey(
          "BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"
        ),
        userCollateral: userCollateralPda,
        position: positionPda,
        user: wallet.publicKey,
      })
      .rpc();

    const market = await program.account.market.fetch(marketPda);
    const orderId = market.nextOrderId;
    const orderPda = getOrderPda(orderId);

    await program.methods
      .placeTpSlOrder(
        orderId,
        { stopLoss: {} },
        new anchor.BN(900_000_000),
        { below: {} }
      )
      .accounts({
        market: marketPda,
        position: positionPda,
        order: orderPda,
        user: wallet.publicKey,
      })
      .rpc();

    await program.methods
      .executeTriggerOrder(orderId)
      .accounts({
        market: marketPda,
        priceUpdate: new anchor.web3.PublicKey(
          "C11dmJTHfjc3AizfTBpnU3DaPvFfywbEZpnN2dKPbU6r"
        ),
        owner: wallet.publicKey,
        userCollateral: userCollateralPda,
        position: positionPda,
        order: orderPda,
        executor: wallet.publicKey,
      })
      .rpc();

    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.isOpen, false);

    console.log("Triggered stop-loss order executed!");
  });

  it("Pool pays profitable positions", async () => {
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        marketPda.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    const marketBefore = await program.account.market.fetch(marketPda);
    const userCollateralBefore = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    const collateral = new anchor.BN(10_000_000);
    const leverage = new anchor.BN(5);
    const tradingFee = new anchor.BN(10_000);
    const positionCollateral = collateral.sub(tradingFee);
    const expectedProfit = new anchor.BN(4_995_000);
    const side = { short: {} };

    await program.methods
      .openPosition(side, collateral, leverage)
      .accounts({
        market: marketPda,
        priceUpdate: new anchor.web3.PublicKey(
          "BGFoj6U2hdVMms3sggreHtQfW7GCF5TeqxNLiKT6iBxc"
        ),
        userCollateral: userCollateralPda,
        position: positionPda,
        user: wallet.publicKey,
      })
      .rpc();

    const userCollateralAfterOpen = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    assert.equal(
      userCollateralAfterOpen.depositedAmount.toString(),
      userCollateralBefore.depositedAmount.sub(tradingFee).toString()
    );
    assert.equal(
      userCollateralAfterOpen.lockedAmount.toString(),
      positionCollateral.toString()
    );

    await program.methods
      .closePosition()
      .accounts({
        market: marketPda,
        userCollateral: userCollateralPda,
        position: positionPda,
        priceUpdate: new anchor.web3.PublicKey(
          "C11dmJTHfjc3AizfTBpnU3DaPvFfywbEZpnN2dKPbU6r"
        ),
        user: wallet.publicKey,
      })
      .rpc();

    const marketAfter = await program.account.market.fetch(marketPda);
    assert.equal(
      marketAfter.poolBalance.toString(),
      marketBefore.poolBalance.sub(expectedProfit).toString()
    );

    const userCollateralAfterClose = await program.account.userCollateral.fetch(
      userCollateralPda
    );
    assert.equal(userCollateralAfterClose.lockedAmount.toString(), "0");
    assert.equal(
      userCollateralAfterClose.depositedAmount.toString(),
      userCollateralBefore.depositedAmount
        .sub(tradingFee)
        .add(expectedProfit)
        .toString()
    );

    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.isOpen, false);

    console.log("Profitable position paid from pool!");
  });
});
