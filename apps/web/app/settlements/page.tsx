import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { DataTable } from "../../components/data-table";
import { getAuthenticatedAppUser } from "../../lib/auth";
import { formatCents, formatDate } from "../../lib/format";
import { getSettlements, type SettlementRow } from "../../lib/server/data";

export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  const appUser = await getAuthenticatedAppUser();
  if (!appUser) return <AuthRequired />;

  const settlements = await getSettlements(appUser.id);

  return (
    <AppShell title="Settled Bets" subtitle="Resolved markets and realized results" meta={settlements.meta}>
      <DataTable<SettlementRow>
        title="Settlements"
        rows={settlements.data}
        emptyTitle="No settlements imported"
        emptyDetail="Resolved market outcomes will appear after Kalshi settlement imports."
        columns={[
          { key: "time", header: "Settled", render: (row) => formatDate(row.settledTime) },
          { key: "ticker", header: "Ticker", render: (row) => row.marketTicker },
          { key: "market", header: "Market", render: (row) => row.marketTitle },
          { key: "pnl", header: "Realized P/L", render: (row) => formatCents(row.realizedPnlCents, { signed: true }) },
          { key: "revenue", header: "Revenue", render: (row) => formatCents(row.revenueCents) },
          { key: "fee", header: "Fee", render: (row) => formatCents(row.feeCents) },
        ]}
      />
    </AppShell>
  );
}
