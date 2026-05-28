import { AccessDenied } from "../../components/access-denied";
import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { BackfillButton } from "../../components/backfill-button";
import { InviteManager } from "../../components/invite-manager";
import { KalshiCredentialsPanel } from "../../components/kalshi-credentials-panel";
import { getPageAuthState } from "../../lib/auth";
import { isClerkConfigured } from "../../lib/env";
import { getKalshiCredentialStatus } from "../../lib/server/kalshi-credentials";
import { getSyncStatus } from "../../lib/server/data";
import { listInvites } from "../../lib/server/invites";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const authState = await getPageAuthState();
  if (authState.status === "signed_out") return <AuthRequired />;
  if (authState.status === "access_denied") return <AccessDenied message={authState.message} />;
  const { appUser } = authState;

  const sync = await getSyncStatus(appUser.id);
  const credentials = await getKalshiCredentialStatus(appUser.id, appUser);
  const invites = appUser.role === "owner" ? await listInvites() : [];

  return (
    <AppShell title="Settings" subtitle="Server-side auth, credentials, and sync controls" meta={sync.meta}>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
          <h2 className="text-lg font-semibold">Runtime</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Row label="Clerk" value={isClerkConfigured() ? "configured" : "missing"} />
            <Row label="Signed in as" value={appUser.email ?? "unknown"} />
            <Row label="Role" value={appUser.role} />
            <Row label="Kalshi credentials" value={credentials.configured ? "configured" : "awaiting per-user key"} />
            <Row label="Netlify-stored key" value={credentials.legacyNetlifyKeyAvailable ? "available" : "not found"} />
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
      <div className="mt-4">
        <KalshiCredentialsPanel initialStatus={credentials} />
      </div>
      {appUser.role === "owner" ? (
        <div className="mt-4">
          <InviteManager initialInvites={invites} />
        </div>
      ) : null}
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
