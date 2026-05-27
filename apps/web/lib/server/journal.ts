import { getPrisma } from "@kalshi-tracker/db";

export type JournalNote = {
  id: string;
  marketTicker: string | null;
  fillId: string | null;
  title: string | null;
  thesis: string | null;
  tags: string[];
  mistakeType: string | null;
  updatedAt: string;
};

function toNote(note: {
  id: string;
  marketTicker: string | null;
  fillId: string | null;
  title: string | null;
  thesis: string | null;
  tags: string[];
  mistakeType: string | null;
  updatedAt: Date;
}): JournalNote {
  return {
    id: note.id,
    marketTicker: note.marketTicker,
    fillId: note.fillId,
    title: note.title,
    thesis: note.thesis,
    tags: note.tags,
    mistakeType: note.mistakeType,
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function listJournalNotes(appUserId: string) {
  const notes = await getPrisma().betNote.findMany({
    where: { appUserId },
    orderBy: { updatedAt: "desc" },
  });
  return notes.map(toNote);
}

export async function createJournalNote(
  appUserId: string,
  input: {
    marketTicker?: string | null;
    fillId?: string | null;
    title?: string | null;
    thesis?: string | null;
    tags?: string[];
    mistakeType?: string | null;
  },
) {
  const note = await getPrisma().betNote.create({
    data: {
      appUserId,
      marketTicker: input.marketTicker || null,
      fillId: input.fillId || null,
      title: input.title || null,
      thesis: input.thesis || null,
      tags: input.tags ?? [],
      mistakeType: input.mistakeType || null,
    },
  });
  return toNote(note);
}

export async function updateJournalNote(
  appUserId: string,
  id: string,
  input: {
    marketTicker?: string | null;
    fillId?: string | null;
    title?: string | null;
    thesis?: string | null;
    tags?: string[];
    mistakeType?: string | null;
  },
) {
  await getPrisma().betNote.updateMany({
    where: { id, appUserId },
    data: {
      marketTicker: input.marketTicker === undefined ? undefined : input.marketTicker || null,
      fillId: input.fillId === undefined ? undefined : input.fillId || null,
      title: input.title === undefined ? undefined : input.title || null,
      thesis: input.thesis === undefined ? undefined : input.thesis || null,
      tags: input.tags,
      mistakeType: input.mistakeType === undefined ? undefined : input.mistakeType || null,
    },
  });

  const note = await getPrisma().betNote.findFirstOrThrow({
    where: { id, appUserId },
  });
  return toNote(note);
}

export async function deleteJournalNote(appUserId: string, id: string) {
  await getPrisma().betNote.deleteMany({
    where: { id, appUserId },
  });
}

export function parseTags(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
