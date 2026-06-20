# Sol-Perps

A custom **perpetual futures trading protocol on Solana**, built with the Anchor
framework. Traders open leveraged long/short positions on SOL, ETH, and WBTC
markets settled in USDC collateral, with limit and take-profit / stop-loss
orders, an LP pool, and keeper-driven liquidations.

> ⚠️ **Status:** early-stage prototype running on **devnet**. The on-chain
> program has not been audited — do not use with real funds.

## Repository layout

This is a [Bun](https://bun.sh)-based monorepo with four parts:

| Path | What it is |
| --- | --- |
| `solperp-anchor/` | The on-chain Anchor program (Rust): markets, positions, orders, liquidations. |
| `perp-frontend/` | Next.js 16 + React 19 trading terminal UI. |
| `bots/liquidator/` | Off-chain keeper bot that liquidates unhealthy positions and executes trigger orders. |
| `scripts/` | Admin/ops scripts for initializing markets and updating risk parameters. |

Key facts:

- **Program ID:** `7oYnX6upn2jhobcxUoarHs7MyyiF7ieZgzMGcjfQhrrD`
- **Cluster:** devnet
- **Collateral:** USDC (6 decimals)
- **Price feeds:** [Pyth](https://pyth.network/) (via the Hermes client and on-chain price updates)

## Architecture

```
                 ┌──────────────────────┐
                 │   perp-frontend (UI)  │
                 │  Next.js + wallet     │
                 └──────────┬───────────┘
                            │ Anchor txs / account reads
                            ▼
   Pyth Hermes ───▶ ┌──────────────────────┐ ◀─── Pyth price update accounts
   (price feeds)    │  solperp-anchor       │
                    │  on-chain program     │
                    │  Markets / Positions  │
                    │  Orders / LP pool     │
                    └──────────┬───────────┘
                            ▲
                            │ liquidate / execute trigger orders
                 ┌──────────┴───────────┐
                 │  bots/liquidator      │
                 │  keeper (polls health)│
                 └──────────────────────┘
```

### On-chain program (`solperp-anchor`)

State accounts (see `programs/solperp-anchor/src/state.rs`):

- **`Market`** — one per symbol; holds admin, leverage cap, liquidation threshold,
  trading fee (bps), Pyth feed id, pool balance, and long/short open interest.
- **`UserCollateral`** — a trader's deposited and locked collateral for a market.
- **`Position`** — an open long/short position (side, collateral, leverage, size, entry price).
- **`TriggerOrder`** — a pending limit / take-profit / stop-loss order.

Enums: `PositionSide` (Long, Short), `OrderType` (Limit, TakeProfit, StopLoss),
`TriggerCondition` (Above, Below).

Instructions (see `programs/solperp-anchor/src/lib.rs`):

- **Market admin:** `initialize_market`, `update_market_config`, `pause_market`,
  `resume_market`, `withdraw_protocol_fees`
- **Collateral:** `deposit_collateral`, `withdraw_collateral`, `migrate_legacy_collateral`
- **Trading:** `open_position`, `close_position`, `liquidate_position`
- **Liquidity pool:** `add_liquidity`, `remove_liquidity`
- **Orders:** `place_limit_order`, `place_tp_sl_order`, `cancel_trigger_order`,
  `execute_trigger_order`

## Prerequisites

- [Bun](https://bun.sh) (package manager / TS runner used across the repo)
- [Rust](https://www.rust-lang.org/tools/install) + [Solana CLI](https://docs.solanalabs.com/cli/install) + [Anchor](https://www.anchor-lang.com/docs/installation) (only needed to build/deploy the program)
- A funded devnet wallet at `~/.config/solana/id.json`

## Getting started

### 1. On-chain program

```bash
cd solperp-anchor
bun install
anchor build           # compile the program
anchor test            # run the TypeScript integration tests against devnet fixtures
anchor deploy          # deploy to the configured cluster (devnet)
```

The program ID and cluster are configured in `solperp-anchor/Anchor.toml`. If you
deploy your own copy, update the program ID there **and** in
`perp-frontend/lib/constants.ts`.

### 2. Markets setup (admin)

From the repo root, initialize markets and tune risk parameters with the
ops scripts:

```bash
bun install
bun run setup:markets        # initialize SOL / ETH / WBTC markets
bun run update:market-risk   # update leverage / liquidation / fee config
```

### 3. Frontend

```bash
cd perp-frontend
bun install
bun run dev                  # start the dev server at http://localhost:3000
```

Configure the RPC endpoint via `perp-frontend/.env.local`:

```bash
# Defaults to https://api.devnet.solana.com when unset
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

See [`perp-frontend/README.md`](perp-frontend/README.md) for frontend details.

### 4. Liquidator / keeper bot

```bash
cd bots/liquidator
bun install
bun run liquidator:dry       # dry run — logs actions without sending txs
bun run liquidator           # live — submits liquidation / trigger txs
```

The bot reads its keypair and RPC settings from `bots/liquidator/.env`. Use the
`:dry` variants (which set `DRY_RUN=true`) to validate behavior before running live.

## Development notes

- **Package manager:** Bun. Each component has its own `package.json` / lockfile.
- **Markets supported:** `SOL`, `ETH`, `WBTC`, all collateralized in USDC.
- **Price data:** on-chain settlement uses Pyth price update accounts; the
  frontend also pulls Pyth prices via Hermes and public 24h ticker stats for display.

## License

No license file is currently included; treat as all-rights-reserved unless a
license is added.
