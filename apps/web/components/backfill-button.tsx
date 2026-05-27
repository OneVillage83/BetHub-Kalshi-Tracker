"use client";

import { useState } from "react";

export function BackfillButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runBackfill() {
    setRunning(true);
    const response = await fetch("/api/sync/backfill", { method: "POST" });
    const payload = await response.json();
    setMessage(payload.data?.message ?? payload.error?.message ?? "Backfill request finished.");
    setRunning(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={runBackfill}
        disabled={running}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "Starting" : "Start backfill"}
      </button>
      {message ? <p className="mt-3 text-sm text-amber-300">{message}</p> : null}
    </div>
  );
}
