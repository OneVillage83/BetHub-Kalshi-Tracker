"use client";

import { useState } from "react";
import type { InviteRow } from "../lib/server/invites";
import { formatDate } from "../lib/format";

export function InviteManager({ initialInvites }: { initialInvites: InviteRow[] }) {
  const [invites, setInvites] = useState(initialInvites);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "user">("user");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    const response = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const payload = await response.json();
    setSaving(false);

    if (response.ok) {
      const invite = payload.data as InviteRow;
      setInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)]);
      setEmail("");
      setMessage("Invite saved.");
    } else {
      setMessage(payload.error?.message ?? "Invite failed.");
    }
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
    const payload = await response.json();
    if (response.ok) {
      const invite = payload.data as InviteRow;
      setInvites((current) => current.map((item) => (item.id === invite.id ? invite : item)));
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
      <h2 className="text-lg font-semibold">Invites</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">Invite users by the email address on their Clerk account.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px_auto]">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="person@example.com"
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
        />
        <select value={role} onChange={(event) => setRole(event.target.value === "owner" ? "owner" : "user")} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100">
          <option value="user">User</option>
          <option value="owner">Owner</option>
        </select>
        <button type="button" onClick={create} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
          Invite
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-300">{message}</p> : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="border-b border-slate-800 px-3 py-2">Email</th>
              <th className="border-b border-slate-800 px-3 py-2">Role</th>
              <th className="border-b border-slate-800 px-3 py-2">Status</th>
              <th className="border-b border-slate-800 px-3 py-2">Created</th>
              <th className="border-b border-slate-800 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td className="border-b border-slate-900 px-3 py-3 text-slate-100">{invite.email}</td>
                <td className="border-b border-slate-900 px-3 py-3 text-slate-300">{invite.role}</td>
                <td className="border-b border-slate-900 px-3 py-3 text-slate-300">{invite.revokedAt ? "revoked" : invite.acceptedAt ? "accepted" : "pending"}</td>
                <td className="border-b border-slate-900 px-3 py-3 text-slate-500">{formatDate(invite.createdAt)}</td>
                <td className="border-b border-slate-900 px-3 py-3 text-right">
                  {!invite.revokedAt ? (
                    <button type="button" onClick={() => revoke(invite.id)} className="rounded-lg border border-red-900/70 px-3 py-1 text-xs text-red-300">
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
