# UI Spec — Dashboard Mockup Direction

## Visual identity

Dark premium fintech terminal.

Palette:

- Background: near-black / dark navy charcoal
- Cards: slate/charcoal panels
- Borders: low-opacity blue-gray
- Primary accent: blue / electric blue
- Secondary accent: teal
- Profit: green
- Loss: muted red
- Warning: amber

## Layout

```txt
Left sidebar | Top header
             | KPI row
             | charts + sync health
             | open positions + recent fills
```

## Sidebar

Items:

- Dashboard
- Bet History
- Open Positions
- Settled Bets
- Analytics
- Journal
- Exports
- Settings

Bottom card:

- Read-only mode
- Your data is secure and never altered.

## Header

- Logo/title: Kalshi Bet Tracker
- Status pill: Read-only API Connected
- Search field: Search markets, positions, or tags...
- Date range selector
- Export button
- User avatar/menu

## KPI cards

Top row:

1. Bankroll — `$6,842`
2. Realized P/L — `+$1,284`
3. Open Exposure — `$9,400`
4. Win Rate — `61%`
5. Fees Paid — `$84`
6. Active Positions — `3`

Each card:

- Icon
- Label
- Big value
- Delta vs previous period
- Mini sparkline

## Charts

### Equity Curve

- Large area chart
- Blue line and fill
- Date range tabs: 7D, 1M, 3M, YTD, 1Y, ALL
- Starting bankroll dashed baseline

### P/L by Category

- Bar chart
- Green positive categories
- Red negative categories
- Categories: Rates, Elections, Crypto, Weather, Sports

### Sync Health

Rows:

- API: Healthy
- Last sync: 24 sec ago
- WebSocket: Live
- Mode: Read-only
- Historical import: Complete

Button:

- View Sync Logs

## Tables

### Open Positions

Columns:

- Market
- Side
- Contracts
- Avg Price
- Mark
- Exposure
- P/L
- Close Date

### Recent Fills

Columns:

- Time
- Market
- Side
- Contracts
- Price
- Fee
- Status

## Component guidance

Use:

- Tailwind
- lucide-react icons
- Recharts for charts
- shadcn-style card/table/button patterns if available
- responsive cards for mobile/tablet later

