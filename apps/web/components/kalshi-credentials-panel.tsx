"use client";

import { useState } from "react";
import type { KalshiCredentialStatus } from "../lib/server/kalshi-credentials";

export function KalshiCredentialsPanel({ initialStatus }: { initialStatus: KalshiCredentialStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [environment, setEnvironment] = useState<"demo" | "production">(initialStatus.environment);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(initialStatus.syncEnabled);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage("Validating read-only Kalshi credentials...");
    const response = await fetch("/api/settings/kalshi-credentials", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ environment, accessKeyId, privateKeyPem, syncEnabled }),
    });
    const payload = await response.json();
    setSaving(false);

    if (response.ok) {
      setStatus(payload.data);
      setAccessKeyId("");
      setPrivateKeyPem("");
      setMessage("Kalshi credentials validated and stored for this user.");
    } else {
      setMessage(payload.error?.message ?? "Credential update failed.");
    }
  }

  async function remove() {
    setSaving(true);
    const response = await fetch("/api/settings/kalshi-credentials", { method: "DELETE" });
    const payload = await response.json();
    setSaving(false);
    if (response.ok) {
      setStatus(payload.data);
      setMessage("Stored Kalshi credentials removed.");
    } else {
      setMessage(payload.error?.message ?? "Credential removal failed.");
    }
  }

  async function readKeyFile(file: File | undefined) {
    if (!file) return;
    setPrivateKeyPem(await file.text());
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
      <h2 className="text-lg font-semibold">Kalshi Credentials</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Store a read-only Kalshi key for your account. Secrets are encrypted server-side and are never shown again.
      </p>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <StatusRow label="Status" value={status.configured ? "configured" : "missing"} />
        <StatusRow label="Key ID hint" value={status.keyIdHint ?? "not set"} />
        <StatusRow label="Environment" value={status.environment} />
        <StatusRow label="Encryption" value={status.encryptionConfigured ? "configured" : "missing APP_ENCRYPTION_KEY"} />
      </div>

      <div className="mt-5 space-y-3">
        <label className="block text-sm text-slate-400">
          Kalshi environment
          <select
            value={environment}
            onChange={(event) => setEnvironment(event.target.value === "demo" ? "demo" : "production")}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="production">Production</option>
            <option value="demo">Demo</option>
          </select>
        </label>
        <Field label="Access key ID" value={accessKeyId} onChange={setAccessKeyId} />
        <label className="block text-sm text-slate-400">
          Private key file
          <input
            type="file"
            accept=".key,.pem,.txt"
            onChange={(event) => void readKeyFile(event.target.files?.[0])}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 outline-none file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-200"
          />
        </label>
        <label className="block text-sm text-slate-400">
          Private key PEM
          <textarea
            value={privateKeyPem}
            onChange={(event) => setPrivateKeyPem(event.target.value)}
            className="mt-1 min-h-36 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-blue-500"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={syncEnabled} onChange={(event) => setSyncEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
          Include this account in hourly scheduled sync
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !status.encryptionConfigured}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Working" : "Validate and save"}
        </button>
        <button type="button" onClick={remove} disabled={saving || !status.configured} className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-300 disabled:opacity-60">
          Remove stored key
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-amber-300">{message}</p> : null}
    </section>
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}
