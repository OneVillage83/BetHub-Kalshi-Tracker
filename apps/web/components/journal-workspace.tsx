"use client";

import { useState } from "react";
import type { JournalNote } from "../lib/server/journal";
import { formatDate } from "../lib/format";

type FormState = {
  id?: string;
  title: string;
  marketTicker: string;
  thesis: string;
  tags: string;
  mistakeType: string;
};

const emptyForm: FormState = {
  title: "",
  marketTicker: "",
  thesis: "",
  tags: "",
  mistakeType: "",
};

export function JournalWorkspace({ initialNotes }: { initialNotes: JournalNote[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  async function saveNote() {
    setSaving(true);
    const endpoint = form.id ? `/api/journal/${form.id}` : "/api/journal";
    const method = form.id ? "PATCH" : "POST";
    const response = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        marketTicker: form.marketTicker,
        thesis: form.thesis,
        tags: form.tags,
        mistakeType: form.mistakeType,
      }),
    });
    const payload = await response.json();
    if (response.ok) {
      const note = payload.data as JournalNote;
      setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
      setForm(emptyForm);
    }
    setSaving(false);
  }

  async function deleteNote(id: string) {
    const response = await fetch(`/api/journal/${id}`, { method: "DELETE" });
    if (response.ok) {
      setNotes((current) => current.filter((note) => note.id !== id));
      if (form.id === id) setForm(emptyForm);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-base font-semibold">{form.id ? "Edit note" : "New note"}</h2>
        <div className="mt-4 space-y-3">
          <Field label="Title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
          <Field label="Market ticker" value={form.marketTicker} onChange={(value) => setForm((current) => ({ ...current, marketTicker: value }))} />
          <label className="block text-sm text-slate-400">
            Thesis
            <textarea
              value={form.thesis}
              onChange={(event) => setForm((current) => ({ ...current, thesis: event.target.value }))}
              className="mt-1 min-h-28 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
            />
          </label>
          <Field label="Tags" value={form.tags} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} />
          <Field label="Mistake type" value={form.mistakeType} onChange={(value) => setForm((current) => ({ ...current, mistakeType: value }))} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveNote}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving" : "Save"}
            </button>
            <button type="button" onClick={() => setForm(emptyForm)} className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-300">
              New
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
        <h2 className="text-base font-semibold">Journal Notes</h2>
        {notes.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-800 p-6 text-sm text-slate-500">No journal notes yet.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-medium text-slate-100">{note.title || note.marketTicker || "Untitled note"}</h3>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(note.updatedAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          id: note.id,
                          title: note.title ?? "",
                          marketTicker: note.marketTicker ?? "",
                          thesis: note.thesis ?? "",
                          tags: note.tags.join(", "),
                          mistakeType: note.mistakeType ?? "",
                        })
                      }
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteNote(note.id)} className="rounded-lg border border-red-900/70 px-3 py-1 text-xs text-red-300">
                      Delete
                    </button>
                  </div>
                </div>
                {note.thesis ? <p className="mt-3 text-sm leading-6 text-slate-300">{note.thesis}</p> : null}
                {note.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {note.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-slate-400">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
      />
    </label>
  );
}
