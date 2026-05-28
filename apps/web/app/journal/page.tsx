import { AccessDenied } from "../../components/access-denied";
import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { JournalWorkspace } from "../../components/journal-workspace";
import { getPageAuthState } from "../../lib/auth";
import { listJournalNotes } from "../../lib/server/journal";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const authState = await getPageAuthState();
  if (authState.status === "signed_out") return <AuthRequired />;
  if (authState.status === "access_denied") return <AccessDenied message={authState.message} />;
  const { appUser } = authState;

  const notes = await listJournalNotes(appUser.id);

  return (
    <AppShell title="Journal" subtitle="Market thesis, tags, and review notes" meta={{ source: "db" }}>
      <JournalWorkspace initialNotes={notes} />
    </AppShell>
  );
}
