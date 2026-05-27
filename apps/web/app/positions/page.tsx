import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { DataTable } from "../../components/data-table";
import { getAuthenticatedAppUser } from "../../lib/auth";
import { formatCents } from "../../lib/format";
import { getPositions, type PositionRow } from "../../lib/server/data";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const appUser = await getAuthenticatedAppUser();
  if (!appUser) return <AuthRequired />;

  const positions = await getPositions(appUser.id);

  return (
    <AppShell title="Open Positions" subtitle="Current exposure and marked performance" meta={positions.meta}>
      <DataTable<PositionRow>
        title="Positions"
        rows={positions.data}
        emptyTitle="No positions imported"
        emptyDetail="Current open positions will populate from the Kalshi positions endpoint."
        columns={[
          { key: "ticker", header: "Ticker", render: (row) => row.marketTicker },
          { key: "market", header: "Market", render: (row) => row.marketTitle },
          { key: "category", header: "Category", render: (row) => row.category },
          { key: "contracts", header: "Contracts", render: (row) => row.positionContracts },
          { key: "avg", header: "Avg", render: (row) => formatCents(row.averagePriceCents) },
          { key: "mark", header: "Mark", render: (row) => formatCents(row.markPriceCents) },
          { key: "exposure", header: "Exposure", render: (row) => formatCents(row.exposureCents) },
          { key: "pnl", header: "P/L", render: (row) => formatCents((row.unrealizedPnlCents ?? 0) + row.realizedPnlCents, { signed: true }) },
        ]}
      />
    </AppShell>
  );
}
