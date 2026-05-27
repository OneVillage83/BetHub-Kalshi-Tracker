# Product Brief — Kalshi Bet Tracker

## Vision

A private prediction-market trading journal and analytics terminal for Kalshi. The app automatically imports user activity through the Kalshi API, calculates performance, and helps the user understand what they are good at, where they leak money, and how their prediction-market bankroll changes over time.

## V1 scope

Read-only automated tracker:

- Dashboard summary
- Bankroll/equity curve
- Realized P/L
- Open exposure
- Win rate
- Fees paid
- Active positions
- Open positions table
- Recent fills table
- Settled bets/history
- Category analytics
- Manual notes/tags
- CSV export
- Sync health panel

## Out of scope for V1

- No order placement
- No order canceling
- No automated trading
- No strategy recommendations that execute trades
- No third-party sharing
- No tax/legal advice; only exports and summaries

## Target user flow

1. User enters Kalshi API key ID and points backend to private key file.
2. App runs historical backfill.
3. Dashboard populates with history.
4. Worker periodically syncs new data.
5. Future always-on worker streams live fills/orders.
6. User reviews performance by market, category, date, and strategy tags.
