# Architecture

## Services

```txt
Browser UI
  -> Next.js web app on Netlify
    -> Clerk auth
      -> App Router route handlers
      -> Prisma Postgres via Prisma ORM
      -> Kalshi REST client
      -> Netlify scheduled sync
```

## App layers

### apps/web

- Dark dashboard UI
- Client-side charts
- Tables for fills/positions/settlements
- Journal UI
- Export UI
- Sync health indicators

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
- Per-user encrypted Kalshi credentials, with optional owner adoption of a Netlify-stored production key
- Scheduled function for periodic sync
