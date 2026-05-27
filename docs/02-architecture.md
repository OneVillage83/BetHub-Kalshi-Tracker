# Architecture

## Services

```txt
Browser UI
  -> Next.js web app on Netlify
    -> Clerk auth
    -> App Router route handlers
      -> Prisma Postgres via Prisma ORM
      -> Kalshi REST client
      -> Netlify scheduled sync stub
```

## App layers

### apps/web

- Dark dashboard UI
- Client-side charts
- Tables for fills/positions/settlements
- Journal UI
- Export UI
- Sync health indicators

### apps/api

- Legacy/local Fastify health shim
- Not the primary hosted API surface

### workers/sync-worker

- Backfill job
- Periodic incremental sync
- WebSocket consumer
- Market enrichment job
- Future always-on worker host if live Kalshi WebSockets are enabled

### packages/kalshi-client

- REST request signer
- Authenticated request wrapper
- Public market data helpers
- User portfolio helpers
- WebSocket subscribe/listener helpers

### packages/db

- Prisma client singleton
- Shared query helpers

## Data flow

1. Backfill pulls portfolio and historical data.
2. Raw payloads are saved for audit.
3. Normalized rows are upserted.
4. New market tickers trigger market/event enrichment.
5. Dashboard queries aggregate normalized tables.
6. WebSocket messages update rows in near real time.

## Deployment

Start with Netlify:

- Web and API route handlers in `apps/web`
- Prisma Postgres for hosted storage
- Clerk environment variables in Netlify
- Kalshi keys in Netlify environment variables only
- Scheduled function stub for periodic sync boundary
