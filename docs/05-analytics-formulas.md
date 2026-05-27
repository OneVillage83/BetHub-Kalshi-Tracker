# Analytics and Formula Notes

## Bankroll

Use latest balance snapshot:

```txt
bankroll = cash_balance + portfolio_value_adjustment_if_available
```

Kalshi balance values may be returned in cents. Keep DB values as integer cents and format in UI.

## Realized P/L

Preferred source:

```txt
realized_pnl = sum(position.realized_pnl_cents)
```

Alternative/reconciliation:

```txt
realized_pnl = sum(settlement.revenue_cents - costs - fees)
```

Exact field names should be confirmed during integration from the raw Kalshi payloads.

## Open exposure

For open positions, approximate exposure:

YES side:

```txt
exposure_cents = contracts * avg_price_cents
```

NO side:

```txt
exposure_cents = contracts * (100 - avg_price_cents)
```

If Kalshi position payload provides a better cost/exposure field, prefer the official value.

## Unrealized P/L

YES:

```txt
unrealized_pnl = contracts * (mark_price_cents - avg_price_cents)
```

NO:

```txt
unrealized_pnl = contracts * (avg_price_cents - mark_price_cents)
```

This is a tracker approximation. Reconcile with Kalshi-provided position data when possible.

## Win rate

For settled markets only:

```txt
win_rate = winning_settled_markets / total_settled_markets
```

Define a win as positive net realized P/L after fees.

## ROI

```txt
roi = realized_pnl / total_cost_basis
```

Track ROI by:

- all time
- date range
- category
- market
- tag/strategy

## CLV idea for later

Closing line value:

```txt
clv = final_pre_close_price - entry_price
```

For YES positions, positive CLV means market moved up after entry. For NO positions, invert the sign.

