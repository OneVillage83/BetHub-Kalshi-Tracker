import { AccessDenied } from "../../components/access-denied";
import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { DashboardCharts } from "../../components/dashboard/dashboard-charts";
import { MetricCard } from "../../components/metric-card";
import { getPageAuthState } from "../../lib/auth";
import { formatCents, formatPercent } from "../../lib/format";
import { getCategoryPnl, getDashboardSummary } from "../../lib/server/data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const authState = await getPageAuthState();
  if (authState.status === "signed_out") return <AuthRequired />;
  if (authState.status === "access_denied") return <AccessDenied message={authState.message} />;
  const { appUser } = authState;

  const [summary, categories] = await Promise.all([getDashboardSummary(appUser.id), getCategoryPnl(appUser.id)]);

  return (
    <AppShell title="General Analytics" subtitle="Performance by time, category, and bankroll movement" meta={summary.meta}>
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Realized P/L" value={formatCents(summary.data.realizedPnlCents, { signed: true })} tone={summary.data.realizedPnlCents >= 0 ? "positive" : "negative"} />
        <MetricCard label="Win Rate" value={formatPercent(summary.data.winRate)} />
        <MetricCard label="Fees Paid" value={formatCents(summary.data.feesPaidCents)} />
        <MetricCard label="Exposure" value={formatCents(summary.data.openExposureCents)} />
      </div>
      <div className="mt-4">
        <DashboardCharts equity={summary.data.equity} categories={categories.data} />
      </div>
    </AppShell>
  );
}
