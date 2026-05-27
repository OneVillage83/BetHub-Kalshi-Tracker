import { apiResponse } from "../../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../../lib/auth";
import { deleteJournalNote, parseTags, updateJournalNote } from "../../../../lib/server/journal";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const note = await updateJournalNote(appUser.id, id, {
    marketTicker: typeof body.marketTicker === "string" ? body.marketTicker : undefined,
    fillId: typeof body.fillId === "string" ? body.fillId : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    thesis: typeof body.thesis === "string" ? body.thesis : undefined,
    tags: body.tags === undefined ? undefined : parseTags(body.tags),
    mistakeType: typeof body.mistakeType === "string" ? body.mistakeType : undefined,
  });

  return apiResponse(note);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const { id } = await params;
  await deleteJournalNote(appUser.id, id);
  return apiResponse({ deleted: true });
}
