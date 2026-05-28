"use client";

import { useRef, useState } from "react";
import type { SyncStatus } from "../lib/server/data";

export function BackfillButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const polling = useRef(false);

  async function runBackfill() {
    setRunning(true);
    setMessage("Starting backfill...");
    setSyncStatus((current) => ({
      api: current?.api ?? "healthy",
      lastSyncAt: current?.lastSyncAt ?? null,
      lastScheduledSyncAt: current?.lastScheduledSyncAt ?? null,
      lastSuccessfulSyncAt: current?.lastSuccessfulSyncAt ?? null,
      lastStatus: "running",
      lastError: null,
      progress: current?.progress ?? {
        stage: "credentials",
        stageLabel: "Starting backfill",
        percent: 3,
        counts: emptyCounts(),
        warnings: [],
        updatedAt: new Date().toISOString(),
      },
      stats: current?.stats ?? emptyCounts(),
      websocket: "stubbed",
      readOnly: true,
      historicalImport: "pending",
    }));
    polling.current = true;
    void pollSyncStatus();

    try {
      const response = await fetch("/api/sync/backfill", { method: "POST" });
      const payload = await response.json();
      const stats = payload.data?.stats;
      const summary =
        stats && response.ok
          ? `Imported ${stats.fills + stats.historicalFills} fills, ${stats.orders + stats.historicalOrders} orders, ${stats.positions} positions, and ${stats.settlements} settlements.`
          : null;
      setMessage(summary ?? payload.data?.message ?? payload.error?.message ?? "Backfill request finished.");
      await refreshSyncStatus();
    } catch {
      setMessage("Backfill request failed. Check the deployment logs and try again.");
    } finally {
      polling.current = false;
      setRunning(false);
    }
  }

  async function pollSyncStatus() {
    while (polling.current) {
      await refreshSyncStatus().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function refreshSyncStatus() {
    const response = await fetch("/api/sync/status");
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.data) setSyncStatus(payload.data);
  }

  const progress = syncStatus?.progress;
  const percent = progress?.percent ?? (running ? 3 : 0);
  const counts = progress?.counts ?? syncStatus?.stats ?? emptyCounts();
  const isTerminal = syncStatus?.lastStatus === "success" || syncStatus?.lastStatus === "failed" || syncStatus?.lastStatus === "stub";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={runBackfill}
        disabled={running}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "Importing" : "Start backfill"}
      </button>
      {running || progress || message ? (
        <div className="space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className={syncStatus?.lastStatus === "failed" ? "text-red-300" : "text-slate-300"}>
              {progress?.stageLabel ?? (running ? "Starting backfill" : "Backfill ready")}
            </span>
            <span className="font-mono text-xs text-slate-500">{Math.round(percent)}%</span>
          </div>
          <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <Stat label="Fills" value={counts.fills + counts.historicalFills} />
            <Stat label="Orders" value={counts.orders + counts.historicalOrders} />
            <Stat label="Positions" value={counts.positions} />
            <Stat label="Settlements" value={counts.settlements} />
          </div>
          {progress?.warnings.length ? <p className="text-xs text-amber-300">{progress.warnings[0]}</p> : null}
          {syncStatus?.lastError && isTerminal ? <p className="text-sm text-red-300">{syncStatus.lastError}</p> : null}
          {message ? <p className="text-sm text-amber-300">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-900/70 px-3 py-2">
      <span>{label}</span>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}

function emptyCounts() {
  return {
    balanceSnapshots: 0,
    fills: 0,
    historicalFills: 0,
    orders: 0,
    historicalOrders: 0,
    positions: 0,
    settlements: 0,
    markets: 0,
    events: 0,
    skippedRows: 0,
  };
}
