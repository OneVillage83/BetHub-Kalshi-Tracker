"use client";

import { useRef, useState } from "react";
import type { SyncStatus } from "../lib/server/data";

export function BackfillButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const polling = useRef(false);
  const continuing = useRef(false);

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
      timedOut: false,
      canResume: false,
      continuationRequired: false,
      statusMessage: "Backfill is still running...",
      websocket: "stubbed",
      readOnly: true,
      historicalImport: "pending",
    }));
    polling.current = true;
    void pollSyncStatus();
    let keepPolling = false;

    try {
      const response = await fetch("/api/sync/backfill", { method: "POST" });
      const payload = await response.json();
      const stats = payload.data?.stats;
      const latestStatus = payload.data?.status;

      if (latestStatus === "success" && stats) {
        setMessage(`Backfill completed. Imported ${stats.fills + stats.historicalFills} fills, ${stats.orders + stats.historicalOrders} orders, ${stats.positions + (stats.eventPositions ?? 0)} positions, and ${stats.settlements} settlements.`);
      } else if (latestStatus === "running" || payload.data?.continuationRequired) {
        keepPolling = true;
        setMessage("Backfill is still running...");
        if (payload.data?.continuationRequired) void continueBackfill();
      } else if (latestStatus === "failed") {
        setMessage(payload.data?.message ?? "Backfill failed. Check the deployment logs and try again.");
      } else if (latestStatus === "stub") {
        setMessage(payload.data?.message ?? "Kalshi credentials are required before backfill.");
      } else if (!response.ok) {
        setMessage(payload.error?.message ?? "Backfill failed. Check the deployment logs and try again.");
      } else {
        keepPolling = true;
        setMessage("Backfill is still running...");
      }
      await refreshSyncStatus({ autoContinue: true });
    } catch {
      setMessage("Backfill request failed. Check the deployment logs and try again.");
    } finally {
      if (!keepPolling) {
        polling.current = false;
        setRunning(false);
      }
    }
  }

  async function pollSyncStatus() {
    while (polling.current) {
      const status = await refreshSyncStatus({ autoContinue: true }).catch(() => null);
      if (status && isTerminalStatus(status)) {
        polling.current = false;
        setRunning(false);
        setMessage(status.statusMessage ?? terminalMessage(status));
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function refreshSyncStatus(options: { autoContinue?: boolean } = {}) {
    const response = await fetch("/api/sync/status");
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload.data) return null;
    setSyncStatus(payload.data);
    if (options.autoContinue && payload.data.continuationRequired && !payload.data.timedOut) void continueBackfill();
    return payload.data as SyncStatus;
  }

  async function continueBackfill() {
    if (continuing.current) return;
    continuing.current = true;
    setMessage("Backfill is still running...");
    try {
      const response = await fetch("/api/sync/backfill/continue", { method: "POST" });
      const payload = await response.json();
      if (payload.data?.status === "success") {
        setMessage("Backfill completed.");
      } else if (payload.data?.status === "running" || payload.data?.continuationRequired) {
        setMessage("Backfill is still running...");
      } else if (!response.ok) {
        setMessage(payload.error?.message ?? "Backfill failed. Check the deployment logs and try again.");
      }
      await refreshSyncStatus();
    } catch {
      setMessage("Backfill failed. Check the deployment logs and try again.");
    } finally {
      continuing.current = false;
    }
  }

  const progress = syncStatus?.progress;
  const percent = progress?.percent ?? (running ? 3 : 0);
  const counts = progress?.counts ?? syncStatus?.stats ?? emptyCounts();
  const isTerminal = syncStatus ? isTerminalStatus(syncStatus) : false;
  const buttonLabel = syncStatus?.canResume ? "Resume backfill" : "Start backfill";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={runBackfill}
        disabled={running}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "Importing" : buttonLabel}
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
            <Stat label="Positions" value={counts.positions + counts.eventPositions} />
            <Stat label="Settlements" value={counts.settlements} />
          </div>
          {progress?.warnings.length ? <p className="text-xs text-amber-300">{progress.warnings[0]}</p> : null}
          {syncStatus?.statusMessage && isTerminal ? <p className={syncStatus.lastStatus === "failed" || syncStatus.timedOut ? "text-sm text-red-300" : "text-sm text-emerald-300"}>{syncStatus.statusMessage}</p> : null}
          {message ? <p className="text-sm text-amber-300">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function isTerminalStatus(status: SyncStatus) {
  return status.lastStatus === "success" || status.lastStatus === "failed" || status.lastStatus === "stub" || status.timedOut;
}

function terminalMessage(status: SyncStatus) {
  if (status.statusMessage) return status.statusMessage;
  if (status.lastStatus === "success") return "Backfill completed.";
  if (status.lastStatus === "failed") return "Backfill failed. Check the deployment logs and try again.";
  if (status.lastStatus === "stub") return "Kalshi credentials are required before backfill.";
  if (status.timedOut) return "Backfill may have timed out; try again.";
  return "Backfill is still running...";
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
    eventPositions: 0,
    settlements: 0,
    markets: 0,
    events: 0,
    skippedRows: 0,
  };
}
