# Acceptance Criteria

## MVP acceptance

The MVP is complete when:

- App runs locally with `pnpm dev` and is configured for Netlify plus Prisma Postgres.
- Dashboard displays empty states and explicit stub tags before API credentials are configured.
- User can configure Kalshi environment and server-side key material through environment variables.
- Backfill command imports real fills and historical fills.
- Positions page shows current open positions.
- Dashboard summary shows bankroll, realized P/L, open exposure, win rate, fees, and active positions.
- Recent fills table updates after sync.
- Settled bets table exists.
- Sync health panel shows last sync, status, errors, and WebSocket stub status.
- No frontend bundle contains Kalshi private key or signing code.
- No trading/order placement functionality exists in v1.

## Quality bar

- TypeScript strict enough to catch obvious API shape issues.
- Every Kalshi response stored raw.
- Upserts are idempotent.
- Empty states are polished.
- Errors explain what failed without leaking secrets.
- UI visually matches the dark mockup direction.
