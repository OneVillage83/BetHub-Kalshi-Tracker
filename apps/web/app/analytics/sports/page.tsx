import { AccessDenied } from "../../../components/access-denied";
import { AppShell } from "../../../components/app-shell";
import { AuthRequired } from "../../../components/auth-required";
import { SportsAnalyticsTerminal } from "../../../components/sports-analytics-terminal";
import { getPageAuthState } from "../../../lib/auth";
import { getDashboardSummary } from "../../../lib/server/data";
import { getSportsAnalytics } from "../../../lib/server/sports-analytics";

export const dynamic = "force-dynamic";

export default async function SportsAnalyticsPage() {
  const authState = await getPageAuthState();
  if (authState.status === "signed_out") return <AuthRequired />;
  if (authState.status === "access_denied") return <AccessDenied message={authState.message} />;
  const { appUser } = authState;

  const [summary, sportsAnalytics] = await Promise.all([getDashboardSummary(appUser.id), getSportsAnalytics(appUser.id)]);

  return (
    <AppShell title="Sports Analytics" subtitle="Sport-specific performance breakdowns and market trends" meta={summary.meta}>
      <SportsAnalyticsTerminal data={sportsAnalytics} />
    </AppShell>
  );
}
