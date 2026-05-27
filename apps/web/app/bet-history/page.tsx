import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { DataTable } from "../../components/data-table";
import { getAuthenticatedAppUser } from "../../lib/auth";
import { formatCents, formatDate } from "../../lib/format";
import { getFills, type FillRow } from "../../lib/server/data";

export const dynamic = "force-dynamic";

export default async function BetHistoryPage() {
  const appUser = await getAuthenticatedAppUser();
  if (!appUser) return <AuthRequired />;

  const fills = await getFills(appUser.id);

  return (
    <AppShell title="Bet History" subtitle="Matched trades imported from Kalshi fills" meta={fills.meta}>
      <DataTable<FillRow>
        title="All Fills"
        rows={fills.data}
        emptyTitle="No fills imported"
        emptyDetail="Authenticated portfolio and historical fills will appear here after backfill."
        columns={[
          { key: "time", header: "Time", render: (row) => formatDate(row.createdTime) },
          { key: "ticker", header: "Ticker", render: (row) => row.marketTicker },
          { key: "market", header: "Market", render: (row) => row.marketTitle },
          { key: "side", header: "Side", render: (row) => row.outcomeSide.toUpperCase() },
          { key: "contracts", header: "Contracts", render: (row) => row.contractCount },
          { key: "price", header: "Price", render: (row) => formatCents(row.priceCents) },
          { key: "fee", header: "Fee", render: (row) => formatCents(row.feeCents) },
          { key: "source", header: "Source", render: (row) => row.source },
        ]}
      />
    </AppShell>
  );
}
