# perp-frontend

The trading terminal UI for **Sol-Perps**, a perpetual futures protocol on
Solana. Built with Next.js 16 (App Router) and React 19. It connects a wallet,
reads on-chain market/position state from the Anchor program, streams prices
from Pyth, and submits trades, collateral, and order transactions.

> Part of the [Sol-Perps](../README.md) monorepo. See the root README for the
> on-chain program and overall architecture.

## Tech stack

- **Next.js 16.2** (App Router) + **React 19**
- **Tailwind CSS 4** for styling (`app/globals.css`)
- **@solana/wallet-adapter** for wallet connection
- **@coral-xyz/anchor** to call the on-chain program via its IDL
- **@pythnetwork/hermes-client** + **pyth-solana-receiver** for price feeds
- **lightweight-charts** for the price chart

## Getting started

```bash
bun install
bun run dev      # http://localhost:3000
```

### Environment

Create `.env.local` to point the app at an RPC endpoint:

```bash
# Defaults to https://api.devnet.solana.com when unset
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

The program ID and market constants live in `lib/constants.ts`. If you deploy
your own copy of the program, update `PROGRAM_ID` there to match.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the dev server. |
| `bun run build` | Production build. |
| `bun run start` | Serve the production build. |
| `bun run lint` | Run ESLint. |

## Project structure

```
app/
  page.tsx        Terminal shell — owns cross-component UI state (selected
                  market, timeframe, tickers, resizable panels) and composes
                  the market rail, chart, trade ticket, positions dock, and
                  admin/collateral panels.
  layout.tsx      Root layout; wraps the app in the wallet context provider.
  globals.css     Tailwind layers + terminal theme.
  components/     UI building blocks:
                    MarketRail        market selector + ticker list
                    PerpChart         lightweight-charts price chart
                    TradeTicket       order entry (market / limit / TP-SL)
                    PositionsDock     open positions and orders
                    CollateralPanel   deposit / withdraw collateral
                    AdminPanel        market init + risk config (admin only)
                    HealthBar         position health indicator
                    Toast             transient notifications
hooks/
  useProgram.ts        builds the Anchor program client from the wallet
  useMarket.ts         polls and deserializes the Market PDA
  usePosition.ts       polls the caller's Position PDA
  useUserCollateral.ts polls the caller's UserCollateral PDA
  usePythPrice.ts      subscribes to Pyth price updates
  useTradeHistory.ts   reconstructs recent fills/orders
lib/
  constants.ts    PROGRAM_ID, PDA seeds, market feed ids, RPC endpoint
  pda.ts          PDA derivation helpers
  pyth.ts         Pyth Hermes / feed id helpers
  format.ts       shared number/address formatting + token<->base-unit conversion
  idl/            generated Anchor IDL + types for the program
```

## How it works

1. The user connects a wallet (`layout.tsx` → wallet adapter).
2. `useProgram` builds an Anchor client; the data hooks derive the relevant PDAs
   (`lib/pda.ts`) and poll account state.
3. Prices come from Pyth (`usePythPrice` / `lib/pyth.ts`); public 24h ticker
   stats are fetched for display only.
4. Trade, collateral, and order actions are submitted as Anchor transactions;
   after a successful tx the affected accounts are refetched.
