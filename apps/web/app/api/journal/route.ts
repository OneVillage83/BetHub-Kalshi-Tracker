import { apiResponse } from "../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../lib/auth";
import { createJournalNote, listJournalNotes, parseTags } from "../../../lib/server/journal";

export const dynamic = "force-dynamic";

export async function GET() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  return apiResponse(await listJournalNotes(appUser.id));
}

export async function POST(req: Request) {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const body = await req.json().catch(() => ({}));
  const note = await createJournalNote(appUser.id, {
    marketTicker: typeof body.marketTicker === "string" ? body.marketTicker : null,
    fillId: typeof body.fillId === "string" ? body.fillId : null,
    title: typeof body.title === "string" ? body.title : null,
    thesis: typeof body.thesis === "string" ? body.thesis : null,
    tags: parseTags(body.tags),
    mistakeType: typeof body.mistakeType === "string" ? body.mistakeType : null,
  });

  return apiResponse(note, undefined, { status: 201 });
}
