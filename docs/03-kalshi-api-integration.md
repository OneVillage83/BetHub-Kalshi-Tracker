# Kalshi API Integration Notes

## Important docs verified for this build

- Kalshi API docs introduction: real-time market data and trade execution API.
- Authenticated request docs: API key ID, private key file, signed headers.
- API keys docs: requests need Kalshi access key, timestamp, and signature headers.
- SDK overview: SDKs use API keys and RSA-PSS signing.
- Portfolio fills: fills are matched trades and older fills may require historical fills.
- Historical cutoff docs: defines when fills/orders/markets move to historical endpoints.
- Orders docs: executed/canceled orders before historical cutoff require historical orders; resting orders remain available through portfolio orders.
- WebSocket user fills/orders: authenticated real-time channels for trading activity.

## Base URLs

Production:

```txt
https://external-api.kalshi.com/trade-api/v2
wss://external-api-ws.kalshi.com/trade-api/ws/v2
```

## Auth

Every authenticated request must include:

```txt
KALSHI-ACCESS-KEY
KALSHI-ACCESS-TIMESTAMP
KALSHI-ACCESS-SIGNATURE
```

Signature should be generated using the Kalshi-documented method: timestamp + HTTP method + path, signed with private key. Do not include query string in the signed path unless current docs say otherwise.

Private key handling:

- Never put private key in frontend code.
- In v1, load private key from file path or encrypted storage on the backend.
- Add encrypted DB credential storage later if needed.
- Keep `READ_ONLY_MODE=true`.

## REST endpoints to implement

### Portfolio/account

```txt
GET /portfolio/balance
GET /portfolio/fills
GET /portfolio/orders
GET /portfolio/positions
GET /portfolio/settlements
GET /portfolio/deposits
GET /portfolio/withdrawals
```

### Historical

```txt
GET /historical/cutoff
GET /historical/fills
GET /historical/orders
GET /historical/markets
GET /historical/markets/{ticker}
```

### Public enrichment

```txt
GET /markets?tickers=...
GET /markets/{ticker}
GET /events
GET /events/{event_ticker}
GET /events/{event_ticker}/metadata
GET /series
```

## WebSocket channels

```txt
user_fills
user_orders
```

Use cases:

- `user_fills`: update recent matched trades immediately.
- `user_orders`: update resting/executed/canceled order status.

## Normalization rules

- Convert cents to integers in DB, format to dollars in UI.
- Preserve raw JSON on every stored record.
- Use `fill_id` as unique key for fills.
- Use `order_id` as unique key for orders.
- Use `market_ticker` as primary ticker reference.
- Prefer `outcome_side` / `book_side` semantics for direction where available.
- Mark source as `portfolio` or `historical`.

## Idempotency

All sync jobs should be safe to rerun:

- Upsert fills by `fill_id`.
- Upsert orders by `order_id`.
- Upsert positions by `account + market_ticker`.
- Upsert markets by `ticker`.
- Store sync run stats.
