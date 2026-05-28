# BetHub Kalshi Tracker

A Netlify-ready, invite-only, read-only Kalshi bet tracking dashboard with Clerk sign-in, Prisma Postgres storage, per-user encrypted Kalshi credentials, user-scoped App Router APIs, journal notes, CSV exports, and explicit stub states until credentials are configured.

## Product goal

Build a private tracker so the user does not manually log Kalshi bets. Version 1 is strictly read-only: no order placement, no order canceling, no trading actions.

## Key confirmed Kalshi API assumptions

- Public market data endpoints can be used for market/event enrichment.
- Authenticated portfolio endpoints can pull member-specific fills, orders, positions, settlements, and balance.
- Fills are the primary source of truth for matched trades.
- Older fills/orders may live behind historical endpoints depending on Kalshi historical cutoff behavior.
- WebSocket user channels can stream real-time user fill/order updates.
- Authenticated requests require API key headers and request signing; private keys must remain server-side only.

See `docs/03-kalshi-api-integration.md` for endpoint details and implementation guidance.

## Stack

- Frontend/API: Next.js App Router + TypeScript + Tailwind + Recharts + lucide-react
- Auth: Clerk
- Database: Prisma Postgres via Prisma ORM 7
- Hosted database config: Netlify must provide `DATABASE_URL` for builds/functions/runtime
- Scheduled sync: hourly Netlify Scheduled Function polling due per-user accounts
- Worker package: retained for future long-running Kalshi backfill/live sync
- Deployment: Netlify plus hosted Prisma Postgres

## Local commands

```bash
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

Without Clerk keys, `/` renders a setup-required state and protected APIs return `401`. Without `DATABASE_URL` on Netlify, authenticated pages render a database setup error instead of a generic server error. Without per-user Kalshi keys, authenticated data APIs return empty DB data with `Stub: awaiting Kalshi credentials` metadata.

On Netlify, deployments run `pnpm db:generate && pnpm db:migrate:deploy && pnpm --filter @kalshi-tracker/web build`. The migration script runs `prisma migrate deploy` when `DATABASE_URL` exists; if the database is not connected yet, it exits cleanly so the setup UI can deploy. Connect Prisma Postgres in Netlify and redeploy to apply the committed migration.

## Production env vars

- `DATABASE_URL`: Prisma Postgres connection string for builds/functions/runtime.
- `APP_ENCRYPTION_KEY`: base64 encoded 32-byte key used to encrypt per-user Kalshi credentials.
- `OWNER_EMAILS`: optional comma-separated Clerk email allowlist for owner accounts. This deployment bootstraps `f_rodriguez91@yahoo.com` as the default owner if the env var is missing.
- `ALLOW_GLOBAL_KALSHI_CREDENTIAL_FALLBACK=true`: optional temporary owner-only bridge for legacy deployment-global Kalshi keys. Leave unset for normal per-user credential mode.

## Folder layout

```txt
kalshi-bet-tracker/
  apps/web/                 # Next.js dashboard
  apps/api/                 # Legacy/local Fastify health shim
  netlify/functions/        # Netlify scheduled sync
  workers/sync-worker/      # Backfill and periodic sync jobs
  packages/kalshi-client/   # Signed Kalshi REST/WebSocket client
  packages/db/              # Shared Prisma/db helpers
  prisma/schema.prisma      # Database model
  docs/                     # Build docs and Codex instructions
```

## Safety

Do not implement trading/order placement endpoints in v1. Private keys must remain server-side only.
