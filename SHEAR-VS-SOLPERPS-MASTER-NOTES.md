# SHEAR vs Sol-Perps — Master Notes (everything in one file)

**Written:** 2026-06-19
**For:** Deepak (Sol-Perps)
**Reference project:** SHEAR → https://github.com/priyanshudotsol/Shear
**Your project root:** /Users/deepak/Documents/Project/Sol-Perps

> How to read this file: it is written in plain language. Every time a new word
> shows up (like "funding rate" or "NAV"), I explain it in one simple line first,
> then go deeper. GitHub links marked **(verify)** are from my memory — open them
> once to confirm the exact path, because repos move files around over time.

---

## 0. The one big thing to settle first: pool vs order book

I gave you two different answers on different days. Here is the final, checked answer
(I read SHEAR's real README + PROGRAM.md to confirm):

- **SHEAR is a POOL model.** Its own README says: *"oracle-priced shared LP pool
  (GMX-v1 style), not a vAMM or order book… no matching engine to build."*
- **You are also a POOL model.** Traders trade against your `pool_balance` at the
  Pyth oracle price.

**So you do NOT need to build an order book to be "like SHEAR."** That earlier
"order book" answer was my mistake. Both of you are the same family:
*trader vs. a shared liquidity pool, priced by an oracle.*

(One nuance: your repo already has `place_limit_order` / `place_tp_sl_order` /
`execute_trigger_order`. Those are **trigger orders**, not a real order book — they
are "if price hits X, then open/close a position at the oracle price." That is a UX
feature, not a matching engine. Good to have. Keep it.)

---

## 1. What is SHEAR (in plain words)

SHEAR is a **pairs / relative-value perpetual exchange**. Normal perps let you bet
"SOL goes up in dollars." SHEAR lets you bet **"SOL beats ETH"** — it does not care
if the whole market goes up or down, only which of the two assets wins.

- A market is a **ratio**: `R = price(SOL) / price(ETH)`.
- Long `SOL-ETH` = profit when SOL outperforms ETH.
- This is called **market-neutral** (you are protected from the overall market
  direction; you only care about the *relative* move).

That is SHEAR's whole identity. It is a real, narrow, clever idea built for the
**MagicBlock "Solana Blitz" hackathon**.

---

## 2. SHEAR's full tool/tech stack — "what makes it best"

This is the list you asked for: every tool SHEAR uses and **why it matters**.

| Layer | Tool SHEAR uses | Plain-language why it's good |
|---|---|---|
| On-chain program | **Rust + Anchor** | Standard Solana smart-contract setup (same as you). |
| Math isolation | **`crates/shear-math` (separate Rust crate)** | They put all the *pure math* (PnL, funding, liquidation) in its own folder with property tests. The rule: "the math module is the only place with real logic." This is the single best engineering idea to copy. |
| Execution speed | **MagicBlock Ephemeral Rollup (ER)** | A temporary fast lane. Trades run on the ER (gasless, near-instant), then settle back to Solana L1. Gives a CEX-like feel without leaving chain. |
| Gasless UX | **Session keys** | User signs once; after that, trades don't pop a wallet approval every time. Feels like a real exchange. |
| Oracle | **Pyth-Lazer (two feeds, divided on-chain)** | They read price(SOL) and price(ETH) and divide them on-chain to make the ratio. With **staleness + confidence guards** (if the price is old or uncertain, the trade is rejected, never mispriced). |
| Automation | **On-chain crank via `ScheduleTask` + permissionless `liquidate`** | A "crank" is a heartbeat that runs funding + liquidation every tick. "Permissionless" = anyone can call liquidate and earn a reward, so the system self-heals. |
| Funding | **Skew-based continuous funding** | The side with more open bets pays the other side + the pool. Keeps long/short balanced. |
| Pool | **Shared USDC LP pool with shares, NAV, `accrued_fees`, `insurance_fund`** | Liquidity providers deposit USDC, get **shares** priced at **NAV** (net asset value = pool value ÷ shares). This is the proper way to run an LP pool. |
| Frontend | **TypeScript** (63% of the repo), session-key trading UX | The frontend is the biggest part of the repo by line count. |

> Note on the chart: I could **not** confirm SHEAR's exact charting library from the
> repo (the frontend `package.json` read was blocked by a rate limit while writing
> this). What is certain is the *capability* you want to match — drawing tools +
> indicators + multi-pane — which means the **TradingView Advanced Charting Library**
> (Section 6), not the basic `lightweight-charts` you have today.

### SHEAR's on-chain account structs (from its PROGRAM.md — verified)
These are the "boxes of data" SHEAR stores on-chain. Compare them to yours in Section 4.

| Account | What it holds |
|---|---|
| `GlobalConfig` | admin, fees, funding interval, oracle program id, staleness bounds, paused flag |
| `Market` | feeds, OI totals, **`cum_funding`**, leverage/MMR/funding params, OI caps, status |
| `LiquidityPool` | **`total_shares`, `pool_usdc`, `accrued_fees`, `insurance_fund`** |
| `LpPosition` | per LP: **`shares`, `cost_basis`** |
| `UserBalance` | per trader: `free_collateral` |
| `Position` | side, notional, entry ratio, collateral, **funding snapshot**, status |
| `ShearVault` | the real USDC token account holding funds |

### SHEAR's on-chain instructions (from PROGRAM.md — verified)
- Admin: `initialize_config`, `create_market`, `set_market_status`
- LP: `deposit_liquidity`, `request_withdraw_liquidity`, `withdraw_liquidity`
- Collateral: `deposit_collateral`, `withdraw_collateral`
- Session: `delegate_session`, `commit_and_undelegate_session`
- Trading: `open_position`, `close_position`, `add_collateral`, `remove_collateral`,
  **`accrue_funding`**, `liquidate`, `crank_liquidations`

They say only **3 instructions have real logic**: `open_position`, `close_position`,
`liquidate`. Everything else is bookkeeping. **Remember this** — it tells you where to
focus your effort.

---

## 3. Your Sol-Perps — what you actually have (read from your code)

Your on-chain instructions (from `lib.rs`):
`initialize_market`, `deposit_collateral`, `withdraw_collateral`,
`migrate_legacy_collateral`, `open_position`, `close_position`, `liquidate_position`,
`pause_market`, `resume_market`, `update_market_config`, `withdraw_protocol_fees`,
`add_liquidity`, `remove_liquidity`, `place_limit_order`, `place_tp_sl_order`,
`cancel_trigger_order`, `execute_trigger_order`.

Your accounts (from `state.rs`): `Market`, `UserCollateral`, `Position`, `TriggerOrder`.

Your frontend stack (from `perp-frontend/package.json`):
- Next.js 16, React 19, TypeScript, Tailwind 4
- `@coral-xyz/anchor` 0.32 (talk to your program)
- `@solana/wallet-adapter-*` (wallet connect)
- `@pythnetwork/hermes-client` + `@pythnetwork/pyth-solana-receiver` (Pyth prices)
- **`lightweight-charts` 5.2.0** ← this is your chart (basic; the gap in Section 6)

**Good news:** you already have MORE trader features than SHEAR in one area —
limit orders + TP/SL + trigger execution. SHEAR explicitly left those out of scope.

---

## 4. The real FLAWS in your project (checked against your code, not guessed)

Ordered by importance. The first three are the difference between "school project"
and "real perp."

### 🔴 FLAW 1 — No funding rate (the #1 missing thing)
- **What it is:** A funding rate is a small fee paid every few hours *between traders*.
  If too many people are long, longs pay shorts (and/or the pool). It keeps the number
  of longs and shorts balanced so the pool isn't one-sided and bleaking money.
- **Proof in your code:** `Market` in `state.rs` has **no** `cum_funding`,
  `funding_rate`, or `last_funding_ts`. `Position` has **no** funding snapshot field.
- **Why it's serious:** Without funding, a perp is not really a perp. Everyone piles
  onto the winning side and the pool eats the losses. This is the SHEAR feature you
  most need.
- **Fix:** add a `cum_funding` index to `Market`, a `last_cum_funding` snapshot to
  `Position`, and an `accrue_funding` instruction. Code skeleton in Section 7.

### 🔴 FLAW 2 — No LP shares / NAV (your liquidity accounting is broken)
- **What it is:** When someone provides liquidity, they should receive **shares** of
  the pool, priced at **NAV** (NAV = total pool value ÷ total shares). Later they burn
  shares to withdraw their fair slice (deposit + earned fees − paid losses).
- **Proof in your code:** You have `add_liquidity` / `remove_liquidity` instructions,
  but `Market` only has a flat `pool_balance` and there is **no `LpPosition` account**
  and **no `total_shares`**. So there is no record of *who owns what fraction* of the
  pool.
- **Why it's serious:** Two LPs deposit, the pool earns fees, and you have no fair way
  to split it. The first withdrawer can take more than their share. This is a real bug,
  not just a missing nicety.
- **Fix:** add `total_shares` to the pool, add an `LpPosition { shares, cost_basis }`
  account, mint shares at NAV on deposit, burn at NAV on withdraw. SHEAR's
  `LiquidityPool` + `LpPosition` is the exact template.

### 🔴 FLAW 3 — No insurance fund
- **What it is:** A reserve bucket that absorbs **bad debt** — when a position blows
  through its collateral so fast that liquidation can't cover the loss.
- **Proof in your code:** Only `pool_balance` exists; there is no `insurance_fund`
  field, so bad debt hits LPs directly.
- **Fix:** add an `insurance_fund: u64` to the pool, route a slice of fees +
  liquidation penalties into it, and drain it first when bad debt happens.

### 🟠 FLAW 4 — Liquidation incentives unclear
- **What it is:** Whoever liquidates a bad position should get paid a small reward
  (a "penalty split"), so bots compete to keep the system healthy. "Permissionless"
  means *anyone* can call it.
- **Action:** open `instructions/liquidation_position.rs` and confirm it (a) is callable
  by anyone, and (b) pays the caller a reward. If not, add it. (You already have a
  `bots/liquidator/liquidator.ts` keeper, so the off-chain half exists.)

### 🟠 FLAW 5 — Oracle staleness/confidence guards
- **What it is:** Before using a Pyth price, you must check it is **fresh** (not old)
  and **confident** (Pyth gives a ± confidence band). If stale/uncertain → reject the
  trade. SHEAR's rule: "No silent mispricing."
- **Action:** open `src/oracle.rs` and confirm you check `publish_time` age and the
  confidence interval. If missing, add it.

### 🟡 FLAW 6 — Frontend chart is basic
- `lightweight-charts` draws candles but has **no drawing tools, no indicators, no
  multi-pane**. Traders expect those. Section 6 fixes this.

### 🟡 FLAW 7 — Price data source mismatch
- Your `ANALYSIS_AND_ROADMAP.md` notes the chart pulls candles from **Binance REST**,
  while trades execute at the **Pyth** price. Two different price sources = the chart
  and your fills can disagree. Prefer one source of truth (Pyth) for both.

### 🟢 FLAW 8 — No tests on the money math
- SHEAR's best practice: pure math in one module with **property tests**. Your `math.rs`
  should have unit tests for PnL, liquidation price, and (soon) funding.

---

## 5. What to ADD — prioritized, each with a GitHub code reference

> "(verify)" = open the link to confirm the exact file path; repos reorganize.

### Add 1 — Funding rate  ⭐ do this first
- **Learn from — Drift Protocol v2 (best funding code on Solana):**
  - Repo: https://github.com/drift-labs/protocol-v2 **(verify)**
  - Look at: `programs/drift/src/math/funding.rs` and
    `programs/drift/src/controller/funding.rs` **(verify)**
  - Why: Drift's funding is production-grade and well-commented.
- **Simpler reference — Solana Labs perpetuals (official sample):**
  - Repo: https://github.com/solana-labs/perpetuals **(verify)**
- **Concept docs:** GMX funding/borrow fees — https://docs.gmx.io **(verify)**

### Add 2 — LP shares + NAV pool
- **Closest template — SHEAR itself** (`state.md`, `instructions.md`): copy
  `LiquidityPool { total_shares, pool_usdc, accrued_fees, insurance_fund }` and
  `LpPosition { shares, cost_basis }`.
  - https://github.com/priyanshudotsol/Shear/blob/main/state.md **(verify)**
- **Production reference — Jupiter Perps JLP pool** (shares = JLP token):
  - Docs: https://station.jup.ag/guides/perpetual-exchange **(verify)**
- **Mango v4** (vault/share accounting in Rust):
  - https://github.com/blockworks-foundation/mango-v4 **(verify)**

### Add 3 — Insurance fund
- **Drift insurance fund** (the reference implementation):
  - https://github.com/drift-labs/protocol-v2 → search `insurance` **(verify)**

### Add 4 — Stronger liquidation (penalty split + crank)
- **Drift liquidation controller:**
  - `programs/drift/src/controller/liquidation.rs` **(verify)**
- You already have the off-chain keeper (`bots/liquidator/liquidator.ts`) — wire the
  on-chain reward to it.

### Add 5 — TradingView Advanced chart → Section 6

### Add 6 — AI trading agent → Section 7 (the "trade helper" you asked about)

### Add 7 (optional, advanced) — MagicBlock Ephemeral Rollup, like SHEAR
- **SDK:** https://github.com/magicblock-labs/ephemeral-rollups-sdk **(verify)**
- **Docs:** https://docs.magicblock.gg **(verify)**
- Gives gasless + session keys + per-block crank. This is what makes SHEAR feel fast.
  Do this LAST — it is the hardest and changes your deploy model.

---

## 6. How to make your chart as advanced as SHEAR's app (TradingView)

**Today:** you use `lightweight-charts` — free, tiny, but **candles only**. No
trendlines, no Fibonacci, no RSI/MACD, no drawing.

**The upgrade target:** **TradingView "Advanced Charting Library"** (a.k.a.
`charting_library`). This is the real deal with drawing tools + 100+ indicators +
multi-pane. It is **free**, but it is **not on npm** — you must request access:

### Step-by-step upgrade path
1. **Request access** to the Advanced Charting Library from TradingView:
   - https://www.tradingview.com/charting-library-docs/ **(verify)** → "Get the library"
   - They give you a private GitHub repo (`tradingview/charting_library`).
2. **Drop the library files** into `perp-frontend/public/charting_library/`.
3. **Write a Datafeed** — this is the bridge that feeds *your* price data into the
   chart. You implement ~5 functions:
   - `onReady` → tell the chart your config (supported timeframes).
   - `resolveSymbol` → describe a symbol (SOL-PERP, decimals, etc.).
   - `getBars` → return historical candles (from Pyth or your own candle store).
   - `subscribeBars` → push new live candles (hook this to your `usePythPrice` stream).
   - `searchSymbols` → optional symbol search.
4. **Mount it** in a new component `app/components/TVAdvancedChart.tsx`, replacing
   `PerpChart.tsx` when ready (keep the old one as a fallback).

### GitHub references for the chart
- **Official tutorial (how to wire a datafeed) — best starting point:**
  - https://github.com/tradingview/charting-library-tutorial **(verify)**
- **Official datafeed examples / UDF:**
  - https://github.com/tradingview/charting_library/wiki **(verify, access-gated)**
- **Free alternative if you don't want to request access — KLineChart**
  (drawing tools + indicators, MIT-licensed, on npm):
  - https://github.com/klinecharts/KLineChart **(verify)**
- You already have `tradingview/lightweight-charts` — keep it for tiny sparklines.

**My recommendation:** if your goal is "look as advanced as SHEAR fast," try
**KLineChart** first (npm install, no access request, has drawing + indicators). Move
to the full TradingView `charting_library` later for the polished, branded feel.

---

## 7. The AI trading agent (the "trade helper" you asked about)

**Goal:** a chat box where the user types "what's my risk on SOL?" or "open a 5x long
SOL" and an AI agent reads the market and helps / places the trade.

### How it works in plain words
1. The AI model (Claude) is given a list of **tools** = your actions, described in
   plain text: `getPrice`, `getMyPositions`, `openPosition`, `closePosition`.
2. The user chats. The model decides which tool to call and with what numbers
   (this is **function calling / tool calling**).
3. Your code runs that tool — which calls your Anchor instruction via the
   `@coral-xyz/anchor` client you already use in your hooks.
4. The result goes back to the model, it replies in plain English.

So an "AI agent" = **LLM + a list of functions that call your existing program.** You
already have the functions (your hooks: `useMarket`, `usePosition`, `TradeTicket`).
You are mostly *wrapping* them.

### GitHub references for the agent
- **Solana Agent Kit** (pre-built Solana actions for AI agents — the fastest start):
  - https://github.com/sendaifun/solana-agent-kit **(verify)**
- **elizaOS** (full agent framework, plugins, memory, chat UI):
  - https://github.com/elizaOS/eliza **(verify)**
- **Vercel AI SDK** (easiest tool-calling in a Next.js app — fits your stack):
  - https://github.com/vercel/ai **(verify)** → `useChat` + `tools`
- **MCP (Model Context Protocol)** if you want the agent reusable across apps:
  - Example: a Jupiter-perps MCP server exists — search "jupiter-perps-mcp" **(verify)**

### Minimal plan for YOUR app (no new backend needed)
1. `npm i ai @ai-sdk/anthropic` (Vercel AI SDK + Claude).
2. Add `app/api/agent/route.ts` — defines tools `getPrice`, `getPositions`,
   `openPosition` that reuse your existing `lib/` + hook logic.
3. Add `app/components/AgentChat.tsx` — a chat panel using `useChat()`.
4. For real trades, the tool returns an **unsigned transaction** the user's wallet
   signs (never put a private key in the agent). For "suggestions only," skip signing.

Start with **read-only** (price, positions, risk) before letting it place trades.

---

## 8. Best-of-the-best GitHub reference list (your study shelf)

| What you want to learn | Repo | Note |
|---|---|---|
| Funding, liquidation, insurance (Solana, Rust) | https://github.com/drift-labs/protocol-v2 **(verify)** | The gold standard on Solana. Read funding + liquidation controllers. |
| Official Solana perps sample (simpler) | https://github.com/solana-labs/perpetuals **(verify)** | Easier to read than Drift. |
| LP pool / share token design | https://github.com/blockworks-foundation/mango-v4 **(verify)** | Vault + share math. |
| Pool-based perp economics (Solidity, but clear) | https://github.com/gmx-io/gmx-synthetics **(verify)** | GMX v2; great funding/pool docs. |
| The actual reference you're cloning | https://github.com/priyanshudotsol/Shear | Read MATH.md, state.md, instructions.md, oracle.md. |
| TradingView datafeed wiring | https://github.com/tradingview/charting-library-tutorial **(verify)** | Step-by-step chart integration. |
| Free advanced chart (drawing+indicators) | https://github.com/klinecharts/KLineChart **(verify)** | npm, no access request. |
| AI agent on Solana | https://github.com/sendaifun/solana-agent-kit **(verify)** | Pre-built actions. |
| Tool-calling in Next.js | https://github.com/vercel/ai **(verify)** | Fits your stack. |
| MagicBlock (gasless/session keys) | https://github.com/magicblock-labs/ephemeral-rollups-sdk **(verify)** | Do last. |

---

## 9. Recommended build order (SHEAR's own order, adapted to you)

SHEAR builds: `math.rs` → `state.rs` → `oracle.rs` → `open` → `close` → `liquidate`
→ **`accrue_funding`** → delegation/ER → crank → frontend. Yours, since the basics
already exist:

1. **Funding rate** (math + `cum_funding` + `accrue_funding`) — biggest gap. ⭐
2. **LP shares + NAV** (fix the liquidity accounting bug).
3. **Insurance fund** (+ route fees/penalties into it).
4. **Harden liquidation** (penalty split + permissionless) and **oracle guards**.
5. **Add tests** to `math.rs` for the above.
6. **Chart upgrade** (KLineChart now, TradingView Advanced later).
7. **AI trade helper** (read-only first, then trade with wallet signing).
8. **MagicBlock ER** (optional, last — the "feels like a CEX" layer).

---

## 10. Funding-rate starter skeleton (so step 1 isn't a blank page)

Plain idea: keep a running total called `cum_funding`. Every interval, push it forward
by the current imbalance. Each position remembers the `cum_funding` value at the moment
it last touched the system; the difference is what it owes or earns.

```rust
// in state.rs — ADD these fields

// on Market:
//   pub cum_funding_long: i128,   // running funding index for longs (signed)
//   pub cum_funding_short: i128,  // running funding index for shorts
//   pub last_funding_ts: i64,     // last time funding was accrued

// on Position:
//   pub last_cum_funding: i128,   // snapshot taken when position last updated
```

```rust
// instructions/accrue_funding.rs  (NEW) — runs on a crank / keeper
pub fn accrue_funding_handler(ctx: Context<AccrueFunding>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let now = Clock::get()?.unix_timestamp;
    let elapsed = now - market.last_funding_ts;
    if elapsed <= 0 { return Ok(()); }

    // skew = how lopsided the book is, in [-1, +1]
    let oi_long = market.open_interest_long as i128;
    let oi_short = market.open_interest_short as i128;
    let total = oi_long + oi_short;
    if total == 0 { market.last_funding_ts = now; return Ok(()); }

    // positive skew => longs are crowded => longs pay
    let skew = (oi_long - oi_short) * 1_000_000 / total; // scaled 1e6
    let rate = skew * FUNDING_COEFF * elapsed as i128 / FUNDING_PERIOD;

    // push the running index forward
    market.cum_funding_long  += rate;
    market.cum_funding_short -= rate;
    market.last_funding_ts = now;
    Ok(())
}
```

```rust
// in close_position.rs — when settling, charge/credit funding:
// let idx_now = if pos.side == Long { market.cum_funding_long } else { market.cum_funding_short };
// let funding_owed = pos.position_size as i128 * (idx_now - pos.last_cum_funding) / 1_000_000;
// settlement = collateral + pnl - funding_owed - close_fee;
```

> This is a teaching skeleton, not audited code. Use **Drift's** `math/funding.rs`
> (Section 5) as the real reference for the exact rounding, caps, and sign handling.

---

## 11. Honest status of this research

- ✅ SHEAR architecture, instructions, accounts, funding/LP/insurance design — **read
  from the real repo** (README.md + PROGRAM.md).
- ✅ Your flaws (no funding, no LP shares, no insurance fund) — **confirmed by reading
  your real `state.rs` and `lib.rs`.**
- ⚠️ The deep web/GitHub scout (Drift/GMX exact file paths, TradingView, AI repos) was
  **rate-limited** mid-run ($10/5h plan cap), so those links are from my knowledge and
  marked **(verify)**. Open each once to confirm the path before relying on it.
- 🔁 To finish the deep scout with live verification, re-run once the rate limit resets,
  or top up the plan, and I'll replace every **(verify)** with an exact, checked path.
```
```

**Next concrete step I recommend:** implement Section 10 (funding rate) — it's the #1
gap and unlocks "real perp" status.
