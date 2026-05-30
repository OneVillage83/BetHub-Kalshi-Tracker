import { AccessDenied } from "../../components/access-denied";
import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { GeneralAnalyticsTerminal } from "../../components/general-analytics-terminal";
import { getPageAuthState } from "../../lib/auth";
import { getDashboardSummary } from "../../lib/server/data";
import { getGeneralAnalytics } from "../../lib/server/general-analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const authState = await getPageAuthState();
  if (authState.status === "signed_out") return <AuthRequired />;
  if (authState.status === "access_denied") return <AccessDenied message={authState.message} />;
  const { appUser } = authState;

  const [summary, analytics] = await Promise.all([getDashboardSummary(appUser.id), getGeneralAnalytics(appUser.id)]);

  return (
    <AppShell title="General Analytics" subtitle="Performance by time, category, and bankroll movement" meta={summary.meta}>
      <GeneralAnalyticsTerminal data={analytics} />
    </AppShell>
  );
}
