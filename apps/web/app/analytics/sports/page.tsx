import { AccessDenied } from "../../../components/access-denied";
import { AppShell } from "../../../components/app-shell";
import { AuthRequired } from "../../../components/auth-required";
import { EmptyState } from "../../../components/empty-state";
import { getPageAuthState } from "../../../lib/auth";
import { getDashboardSummary } from "../../../lib/server/data";

export const dynamic = "force-dynamic";

export default async function SportsAnalyticsPage() {
  const authState = await getPageAuthState();
  if (authState.status === "signed_out") return <AuthRequired />;
  if (authState.status === "access_denied") return <AccessDenied message={authState.message} />;
  const { appUser } = authState;

  const summary = await getDashboardSummary(appUser.id);

  return (
    <AppShell title="Sports Analytics" subtitle="Sport-specific performance breakdowns and market trends" meta={summary.meta}>
      <EmptyState
        title="Sports analytics are coming soon"
        detail="Sport-level performance, league trends, and market-type breakdowns will appear here once those analytics are available."
      />
    </AppShell>
  );
}
