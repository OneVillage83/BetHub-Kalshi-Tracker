# Codex Start Here — BetHub Kalshi Tracker

You are building the Bethub Kalshi Bet Tracker. Treat this package as the project spec and scaffold.

## Non-negotiables

1. Read-only v1. Do not place, cancel, amend, decrease, or create orders.
2. Never expose Kalshi private keys to the frontend.
3. Store encrypted credentials server-side only.
4. Use fills as the source of truth for matched bets.
5. Pull historical fills/orders during backfill.
6. Preserve raw JSON from Kalshi for audit/debugging.
7. Make the UI match the supplied dark fintech dashboard mockup style.

## Build phase 1 — Netlify scaffold

Implement enough to run locally with:

```bash
pnpm install
pnpm db:generate
pnpm dev
```

Minimum running pieces:

- Next.js dashboard route at `/`
- Next.js health endpoint at `/api/health`
- Prisma Postgres schema and Prisma 7 config
- Clerk sign-in/sign-up routes and protected app/API routes
- Empty dashboard states rendered in the UI with stub metadata until credentials are configured
- Netlify build and scheduled function
- Environment variables documented in `.env.example`

## Build phase 2 — Kalshi client

Implement:

- signed REST request helper
- `getBalance()`
- `getFills()`
- `getHistoricalFills()`
- `getOrders()`
- `getHistoricalOrders()`
- `getPositions()`
- `getSettlements()`
- `getMarketsByTickers()`
- `getEvent()` / `getEvents()` enrichment helpers

## Build phase 3 — Backfill sync

Implement the app backfill flow:

```bash
POST /api/sync/backfill
```

It should:

1. Create a sync run record.
2. Pull balance, positions, settlements, fills, historical fills, orders, historical orders.
3. Upsert all records idempotently.
4. Enrich unknown market tickers.
5. Store raw API payloads.
6. Mark sync run complete or failed.

## Build phase 4 — Dashboard from database

Use real DB-backed API routes with empty states when no imports exist:

- `/api/dashboard/summary`
- `/api/fills`
- `/api/positions`
- `/api/settlements`
- `/api/analytics/category-pnl`
- `/api/sync/status`

## Build phase 5 — Live sync boundary

Keep a scaffolded boundary for:

- `user_fills`
- `user_orders`

Netlify does not run a persistent listener in this app. Add an always-on service before enabling real WebSocket consumption.

## Build phase 6 — Journal and export

Add:

- manual notes/tags per market and per fill
- CSV export for fills, settlements, fees, deposits/withdrawals
- yearly tax helper export

## UI direction

See `docs/04-ui-spec.md`. The dashboard should feel like a polished dark-mode analytics terminal: blue/teal accents, green positive P/L, red losses, rounded cards, clean tables, Recharts line/bar charts, and clear sync-health visibility.
