import { Download } from "lucide-react";
import { AccessDenied } from "../../components/access-denied";
import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { getPageAuthState } from "../../lib/auth";
import { getSyncStatus } from "../../lib/server/data";

export const dynamic = "force-dynamic";

export default async function ExportsPage() {
  const authState = await getPageAuthState();
  if (authState.status === "signed_out") return <AuthRequired />;
  if (authState.status === "access_denied") return <AccessDenied message={authState.message} />;
  const { appUser } = authState;

  const sync = await getSyncStatus(appUser.id);

  return (
    <AppShell title="Exports" subtitle="CSV exports for fills and settlements" meta={sync.meta}>
      <div className="grid gap-4 md:grid-cols-2">
        <ExportCard href="/api/exports/fills.csv" title="Fills CSV" detail="Matched trades, prices, fees, and source." />
        <ExportCard href="/api/exports/settlements.csv" title="Settlements CSV" detail="Settled markets, revenue, fees, and realized P/L." />
      </div>
    </AppShell>
  );
}

function ExportCard({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <a href={href} className="rounded-lg border border-slate-800 bg-slate-950/80 p-5 hover:border-blue-500/50">
      <Download className="h-5 w-5 text-blue-300" />
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </a>
  );
}
