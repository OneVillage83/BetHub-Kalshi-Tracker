import { Activity, Database, RadioTower } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { AuthRequired } from "../components/auth-required";
import { DataTable } from "../components/data-table";
import { DashboardCharts } from "../components/dashboard/dashboard-charts";
import { MetricCard } from "../components/metric-card";
import { getAuthenticatedAppUser } from "../lib/auth";
import { formatCents, formatDate, formatPercent } from "../lib/format";
import { getCategoryPnl, getDashboardSummary, getFills, getPositions, getSyncStatus, type FillRow, type PositionRow } from "../lib/server/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const appUser = await getAuthenticatedAppUser();
  if (!appUser) return <AuthRequired />;

  const [summary, positions, fills, categoryPnl, syncStatus] = await Promise.all([
    getDashboardSummary(appUser.id),
    getPositions(appUser.id),
    getFills(appUser.id),
    getCategoryPnl(appUser.id),
    getSyncStatus(appUser.id),
  ]);

  return (
    <AppShell title="Dashboard" subtitle="Private Kalshi portfolio analytics" meta={summary.meta}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Bankroll" value={formatCents(summary.data.bankrollCents)} />
        <MetricCard label="Realized P/L" value={formatCents(summary.data.realizedPnlCents, { signed: true })} tone={summary.data.realizedPnlCents >= 0 ? "positive" : "negative"} />
        <MetricCard label="Open Exposure" value={formatCents(summary.data.openExposureCents)} />
        <MetricCard label="Win Rate" value={formatPercent(summary.data.winRate)} />
        <MetricCard label="Fees Paid" value={formatCents(summary.data.feesPaidCents)} />
        <MetricCard label="Active Positions" value={String(summary.data.activePositions)} />
      </div>

      <div className="mt-4">
        <DashboardCharts equity={summary.data.equity} categories={categoryPnl.data} />
      </div>

      <section className="mt-4 rounded-lg border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
          <RadioTower className="h-4 w-4 text-teal-300" />
          Sync Health
        </h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <SyncItem icon={<Database className="h-4 w-4" />} label="API" value={syncStatus.data.api} />
          <SyncItem icon={<Activity className="h-4 w-4" />} label="Last sync" value={formatDate(syncStatus.data.lastSyncAt)} />
          <SyncItem icon={<RadioTower className="h-4 w-4" />} label="WebSocket" value={syncStatus.data.websocket} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <DataTable<PositionRow>
          title="Open Positions"
          rows={positions.data.slice(0, 8)}
          emptyTitle="No open positions"
          emptyDetail="Open positions will appear here after the first authenticated Kalshi import."
          columns={[
            { key: "market", header: "Market", render: (row) => row.marketTitle },
            { key: "contracts", header: "Contracts", render: (row) => row.positionContracts },
            { key: "avg", header: "Avg", render: (row) => formatCents(row.averagePriceCents) },
            { key: "mark", header: "Mark", render: (row) => formatCents(row.markPriceCents) },
            { key: "exposure", header: "Exposure", render: (row) => formatCents(row.exposureCents) },
            { key: "pnl", header: "P/L", render: (row) => formatCents((row.unrealizedPnlCents ?? 0) + row.realizedPnlCents, { signed: true }) },
          ]}
        />
        <DataTable<FillRow>
          title="Recent Fills"
          rows={fills.data.slice(0, 8)}
          emptyTitle="No fills imported"
          emptyDetail="Fills are the source of truth and will populate once Kalshi credentials are configured."
          columns={[
            { key: "time", header: "Time", render: (row) => formatDate(row.createdTime) },
            { key: "market", header: "Market", render: (row) => row.marketTitle },
            { key: "side", header: "Side", render: (row) => row.outcomeSide.toUpperCase() },
            { key: "count", header: "Contracts", render: (row) => row.contractCount },
            { key: "price", header: "Price", render: (row) => formatCents(row.priceCents) },
            { key: "fee", header: "Fee", render: (row) => formatCents(row.feeCents) },
          ]}
        />
      </div>
    </AppShell>
  );
}

function SyncItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-3">
      <span className="flex items-center gap-2 text-slate-400">
        {icon}
        {label}
      </span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}
