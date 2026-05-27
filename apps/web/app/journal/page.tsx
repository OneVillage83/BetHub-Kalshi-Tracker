import { AppShell } from "../../components/app-shell";
import { AuthRequired } from "../../components/auth-required";
import { JournalWorkspace } from "../../components/journal-workspace";
import { getAuthenticatedAppUser } from "../../lib/auth";
import { listJournalNotes } from "../../lib/server/journal";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const appUser = await getAuthenticatedAppUser();
  if (!appUser) return <AuthRequired />;

  const notes = await listJournalNotes(appUser.id);

  return (
    <AppShell title="Journal" subtitle="Market thesis, tags, and review notes" meta={{ source: "db" }}>
      <JournalWorkspace initialNotes={notes} />
    </AppShell>
  );
}
