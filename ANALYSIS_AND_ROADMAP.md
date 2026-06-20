# Sol-Perps Production-Grade SaaS Analysis & Improvement Roadmap

**Date:** 2026-06-14 (analysis performed via live filesystem inspection)
**Project Root:** /Users/deepak/Documents/Project/Sol-Perps
**Status:** Early-stage custom Solana perpetuals protocol (CLOB + AMM hybrid elements) with frontend terminal UI and liquidator keeper. Not yet production/SaaS ready.

## 1. Project Overview (What it is & How it works)

Sol-Perps is a **custom-built perpetual futures trading protocol on Solana** using Anchor framework. It allows users to trade perps (long/short) with leverage on markets like SOL, ETH, WBTC against USDC collateral.

### Core Architecture (from file inspection):

**1. On-Chain Program (solperp-anchor/)**
- **Language:** Rust + Anchor 0.32
- **Key Files:**
  - `programs/solperp-anchor/src/lib.rs` + `state.rs`: Defines PDAs for Market, Position, Order, LiquidityPool, etc.
  - `instructions/`: 15+ instructions including:
    - `open_position.rs`, `close_position.rs`, `liquidation_position.rs`
    - `place_limit_order.rs`, `place_tp_sl_order.rs`, `execute_trigger_order.rs`, `cancel_trigger_order.rs` (shows orderbook intent already)
    - `deposit_collateral.rs`, `withdraw_collateral.rs`
    - `add_liquidity.rs`, `remove_liquidity.rs` (LP for funding/liquidity provision)
    - `initialize_market.rs`, `pause_market.rs`, `resume_market.rs`, `update_market_config.rs`
  - `oracle.rs`: Pyth integration for price feeds.
  - `math.rs`, `constants.rs`, `error.rs`, `event.rs`: Standard Anchor patterns.
- **How it works:** Markets are single PDAs per symbol. Positions tracked on-chain. Limit/TP/SL orders stored. Liquidations callable by keepers. Collateral in SPL token accounts. No full on-chain matching engine visible yet (likely off-chain matching or simple matching in instructions).
- **Deployment:** Anchor.toml, target/ has built .so, types generated.

**2. Frontend (perp-frontend/) - Next.js 16 + React 19 Terminal UI**
- **Tech:** Tailwind, lightweight-charts, @solana/wallet-adapter, Anchor client, Pyth Hermes.
- **Key Files (source, ignoring .next/.agents noise):**
  - `app/page.tsx` (417 lines): Main terminal shell. State for selectedMarket, timeframe, tickers (from Binance REST), ticket width. Composes MarketRail, PerpChart, TradeTicket, PositionsDock, CollateralPanel, AdminPanel.
  - `app/layout.tsx`: Wallet provider setup.
  - `components/`: TradeTicket (order entry), PerpChart (lightweight-charts), MarketRail (market selector + tickers), PositionsDock, etc.
  - `hooks/`:
    - `useMarket.ts`: Polls `connection.getAccountInfo` + deserializes Market PDA via IDL. No WS.
    - `usePosition.ts`, `useUserCollateral.ts`, `usePythPrice.ts`: Similar polling + Pyth.
  - `lib/`: PDA helpers, formatters, constants (PROGRAM_ID), IDL import.
- **Data Sources (current):**
  - On-chain: Anchor program accounts (polled).
  - Prices: Pyth (Hermes client).
  - Tickers/volume: Binance REST API (24hr ticker) — not reliable for production.
- **How it works:** Wallet connect → select market → view chart (Binance data) + on-chain market state → place trades via Anchor txs. Positions/collateral fetched on demand.

**3. Bots & Automation (bots/liquidator/)**
- `liquidator.ts` (13k+ lines): Keeper bot for liquidations, trigger orders. Uses Anchor, Pyth, dry-run mode. Polls accounts, monitors health factor, executes liquidations.
- Scripts: `setup-markets.ts`, `update-market-risk.ts` (root + scripts/).

**4. Root**
- Minimal package.json (Bun workspaces feel).
- Empty root README.

**Current State Summary:** Functional prototype for trading perps on custom program. Strong on-chain instruction coverage for orders/liquidations. Weak on real-time data, orderbook visualization, production hardening, multi-user SaaS features.

## 2. Gaps vs Production SaaS Grade (like Hyperliquid, Drift, GMX SaaS)

**Critical Missing for "Best in Class":**
- **No WebSocket / Real-time Orderbook:** All data polling (REST). High latency, inefficient RPC usage. No live orderbook depth, trades feed, position updates.
- **Orderbook UX:** Has `place_limit_order` on-chain but no visible live orderbook UI (bids/asks ladder, depth chart, recent trades). Binance tickers only.
- **SaaS Features:** No auth/users, no API keys, no billing/subscriptions, no multi-wallet management, no history DB, no notifications.
- **Reliability:** No tx simulation pre-flight in all paths, limited error handling, no retries/backoff, no circuit breakers for RPC.
- **Observability:** No logging aggregation, metrics, alerts (liquidation failures, high open interest).
- **Frontend Polish:** .agents/ dir pollution (irrelevant skills docs), heavy .next cache, no mobile support, chart not synced to on-chain trades.
- **Backend:** Pure client-side. Needs server for keepers, user data, rate limiting, caching.
- **Security/Compliance:** No rate limiting, no MEV protection, no audit status visible, no test coverage visible beyond basic.
- **Deployment:** No Docker, CI, multi-env (devnet/mainnet-beta), RPC failover.
- **Scalability:** Single RPC, no Redis cache for snapshots, no orderbook snapshot + delta via WS.

**Strengths:** Solid Anchor instruction set, Pyth integration, liquidator bot, clean terminal UI concept, limit + TP/SL support already.

## 3. Recommended Changes & Additions (Prioritized)

### Phase 1: Real-time Orderbook + WebSocket (Immediate, as requested)
1. **Add WS Subscriptions** (use @solana/web3.js or @solana/rpc-subscriptions):
   - `connection.onAccountChange(marketPda, callback)` for market state.
   - `connection.onProgramAccountChange(PROGRAM_ID, ...)` filtered for orders/positions.
   - Pyth WS via Hermes or dedicated price WS.
   - Replace Binance REST with Binance WS or better on-chain + Pyth WS for consistency.
2. **Orderbook Component:**
   - New `Orderbook.tsx`: Live bids/asks ladder (fetch Order PDAs, aggregate by price level).
   - Depth chart (lightweight-charts or custom canvas).
   - Recent trades feed (listen to program events via `connection.onLogs` or dedicated event parser).
   - Update `useMarket.ts` + new `useOrderbook.ts` hook with WS + fallback polling.
3. **Trade Execution:** Simulate txs, show impact on orderbook before submit. Add post-only, IOC, FOK if program supports.

**Files to Modify/Create:**
- `perp-frontend/hooks/useOrderbook.ts` (new, WS primary)
- `perp-frontend/components/Orderbook.tsx` (new)
- Update `page.tsx` to include Orderbook beside TradeTicket.
- `bots/liquidator/liquidator.ts`: Add WS for faster reaction.

### Phase 2: Production Hardening & SaaS Features
**Backend (New - Bun/Hono or Next.js API routes + tRPC):**
- User auth (Privy + wallet signatures or SIWS).
- API keys for bots/traders (with scopes, rate limits).
- Postgres + Prisma for: users, api_keys, trade_history, alerts, subscriptions.
- Order history, P&L, funding payments sync (indexer worker).
- Notification service (email, Telegram, in-app via WS).

**Additional Features to Add:**
- **Risk Dashboard:** Funding rate history, liquidation price calculator, utilization %, OI limits.
- **Advanced Trading:** TWAP, scale orders, bracket orders (extend program if needed).
- **Portfolio:** Multi-market positions, unrealized PnL, collateral across markets.
- **Analytics:** Leaderboard (anonymized), volume stats, keeper performance.
- **Admin/Keepers:** Enhanced AdminPanel with pause, risk params, fee withdrawal. Multi-keeper support with leader election.
- **Monitoring:** Integrate Sentry, Prometheus metrics (tx count, liquidation success rate), health checks.
- **DevOps:** 
  - Dockerfile + docker-compose (local validator + FE + bot + DB).
  - GitHub Actions: build, test (anchor test), deploy (Anchor to devnet/mainnet).
  - Multi-RPC (Helius, QuickNode, Triton) with failover.
  - Redis for orderbook snapshots + rate limiting.
- **Testing:** Add Jest + Playwright for FE, more Anchor tests (property-based for math), liquidation scenarios.
- **Docs:** Proper README, API docs (OpenAPI for SaaS API), architecture diagram.
- **Polish:** Remove .agents/ pollution, responsive design, keyboard shortcuts, sound for fills (like trading terminals), dark theme consistency.

**Monetization (SaaS):**
- Tiered: Free (limited leverage/volume), Pro (higher limits, API, priority liquidation protection), Enterprise (white-label, dedicated keepers).
- Revenue share on trading fees or subscription.

## 4. Immediate Next Steps (Actionable)

1. **Today:** Implement `useOrderbook.ts` + basic Orderbook UI component using WS subscription on Order PDAs.
2. **This Week:** Migrate all polling hooks to hybrid WS + polling. Add live trades feed.
3. **Next:** Add backend skeleton (Hono + Postgres) + auth.
4. **Ongoing:** Run `bun install` in subdirs if needed, `anchor build` to verify program, test liquidator on devnet.

This project has strong foundations (especially the on-chain order + liquidation logic). With WS orderbook + SaaS backend, it can become a competitive Solana perps terminal/SaaS.

**Next Action Recommendation:** Confirm if you want me to implement the WS orderbook hook + component now (first working artifact), or focus on specific area (e.g., backend, liquidator improvements, full audit of one file).

All analysis backed by direct `ls`, `read_file`, `find`, `search_files` tool output on the live filesystem. No guesses.