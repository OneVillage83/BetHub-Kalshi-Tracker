import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { BackfillButton } from "../../components/backfill-button";
import { getAuthenticatedAppUser } from "../../lib/auth";
import { hasKalshiCredentials, isClerkConfigured, kalshiEnvironment, keyIdHint, STUB_REASON_AWAITING_KALSHI } from "../../lib/env";
import { getSyncStatus } from "../../lib/server/data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const appUser = await getAuthenticatedAppUser();
  if (!appUser) return <AuthRequired />;

  const sync = await getSyncStatus(appUser.id);
  const hasCredentials = hasKalshiCredentials();

  return (
    <AppShell title="Settings" subtitle="Server-side auth, credentials, and sync controls" meta={sync.meta}>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
          <h2 className="text-lg font-semibold">Runtime</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Row label="Clerk" value={isClerkConfigured() ? "configured" : "missing"} />
            <Row label="Kalshi environment" value={kalshiEnvironment()} />
            <Row label="Kalshi credentials" value={hasCredentials ? "configured" : STUB_REASON_AWAITING_KALSHI} />
            <Row label="Key ID hint" value={keyIdHint() ?? "not set"} />
            <Row label="Read-only mode" value="enabled" />
          </div>
        </section>
        <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
          <h2 className="text-lg font-semibold">Backfill</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Run a read-only import of Kalshi balance, fills, historical fills, positions, settlements, and market metadata.
          </p>
          <div className="mt-5">
            <BackfillButton />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}
