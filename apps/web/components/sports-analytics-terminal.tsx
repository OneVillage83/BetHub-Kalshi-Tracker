"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Activity, BarChart3, Clock, Gauge, Shield, Trophy } from "lucide-react";
import { EmptyState } from "./empty-state";
import { formatCents, formatPercent } from "../lib/format";
import type { SportsAnalyticsData } from "../lib/server/sports-analytics";

type SportsTab = "overview" | "leagues" | "market-types" | "clv" | "risk" | "execution" | "behavior";

const tabs: Array<{ id: SportsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "leagues", label: "Leagues & Teams" },
  { id: "market-types", label: "Market Types" },
  { id: "clv", label: "Edge / CLV" },
  { id: "risk", label: "Risk & Exposure" },
  { id: "execution", label: "Execution Quality" },
  { id: "behavior", label: "Betting Behavior" },
];

export function SportsAnalyticsTerminal({ data }: { data: SportsAnalyticsData }) {
  const [activeTab, setActiveTab] = useState<SportsTab>("overview");
  const equityData = useMemo(
    () =>
      data.overview.equity.map((point) => ({
        date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(point.date)),
        pnl: point.valueCents / 100,
      })),
    [data.overview.equity],
  );
  const leagueData = data.overview.leaguePnl.map((row) => ({ label: row.label, pnl: row.valueCents / 100 }));
  const marketTypeData = data.overview.marketTypePnl.map((row) => ({ label: row.label, pnl: row.valueCents / 100 }));
  const clvDistribution = data.clv.distribution.map((row) => ({ label: row.bucket, fills: row.fills }));
  const calibration = data.clv.calibration.map((row) => ({
    bucket: row.bucket,
    implied: Math.round(row.impliedProbability * 100),
    actual: row.actualWinRate == null ? null : Math.round(row.actualWinRate * 100),
  }));
  const showDiagnostics =
    data.diagnostics.classificationWarnings.length > 0 || (!data.hasSportsData && data.diagnostics.totalImportedFills > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SportsKpi label="Sports Net P/L" value={formatMaybeCents(data.kpis.netPnlCents, true)} tone={toneForCents(data.kpis.netPnlCents)} />
        <SportsKpi label="Sports ROI" value={formatMaybePercent(data.kpis.roi)} tone={toneForNumber(data.kpis.roi)} />
        <SportsKpi label="Sports Win Rate" value={formatMaybePercent(data.kpis.winRate)} />
        <SportsKpi label="Average CLV" value={formatMaybeClv(data.kpis.averageClvCents)} tone={toneForNumber(data.kpis.averageClvCents)} />
        <SportsKpi label="Open Sports Exposure" value={formatMaybeCents(data.kpis.openExposureCents)} />
        <SportsKpi label="Sports Fee Drag" value={formatMaybeCents(data.kpis.feeDragCents)} tone="negative" />
      </div>

      {showDiagnostics ? <SportsDiagnosticsPanel diagnostics={data.diagnostics} /> : null}

      {!data.hasSportsData && !showDiagnostics ? (
        <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
          <EmptyState
            title="No sports fills imported yet"
            detail="Sports analytics will populate after Kalshi sports fills, orders, positions, settlements, and metadata are imported."
          />
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80 p-2">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-2 text-sm ${
                activeTab === tab.id ? "bg-blue-600/25 text-blue-100" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <ChartCard title="Sports Equity Curve" empty={!equityData.length} emptyTitle="No resolved sports P/L">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Area type="monotone" dataKey="pnl" stroke="#38bdf8" fill="#2563eb" fillOpacity={0.28} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="P/L by League" className="xl:col-span-5" empty={!leagueData.length} emptyTitle="No league P/L yet">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leagueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {leagueData.map((row) => (
                    <Cell key={row.label} fill={row.pnl >= 0 ? "#14b8a6" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <PerformanceTable rows={data.overview.favoritePerformance} title="Favorite vs Underdog Performance" />
        </div>
      ) : null}

      {activeTab === "leagues" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="P/L by League" empty={!leagueData.length} emptyTitle="No league P/L yet">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leagueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="pnl" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <TeamBiasTable rows={data.behavior.teamBias} />
        </div>
      ) : null}

      {activeTab === "market-types" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="P/L by Market Type" empty={!marketTypeData.length} emptyTitle="No market-type P/L yet">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marketTypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="pnl" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <PerformanceTable rows={data.overview.favoritePerformance} title="Entry Price Bucket Performance" />
        </div>
      ) : null}

      {activeTab === "clv" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <ChartCard title="Closing Price Value Distribution" empty={!clvDistribution.some((row) => row.fills > 0)} emptyTitle="No CLV data yet">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clvDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="fills" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Calibration by Entry Bucket" className="xl:col-span-5" empty={!calibration.some((row) => row.actual != null)} emptyTitle="No settled calibration data">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calibration}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="bucket" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <ChartTooltip />
                <Line type="monotone" dataKey="implied" stroke="#38bdf8" strokeWidth={2} />
                <Line type="monotone" dataKey="actual" stroke="#14b8a6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <EntryTimingTable rows={data.clv.entryTiming} />
        </div>
      ) : null}

      {activeTab === "risk" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <ExposureList title="Exposure by Sport" rows={data.risk.bySport} icon={<Trophy className="h-4 w-4 text-blue-300" />} />
          <ExposureList title="Exposure by League" rows={data.risk.byLeague} icon={<BarChart3 className="h-4 w-4 text-teal-300" />} />
          <ExposureList title="Exposure by Team" rows={data.risk.byTeam} icon={<Shield className="h-4 w-4 text-emerald-300" />} />
          <SameGameExposure rows={data.risk.byEvent} />
          <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-4">
            <h2 className="text-base font-semibold">Resolving Exposure</h2>
            <div className="mt-4 space-y-3">
              {data.risk.resolving.map((row) => (
                <InfoRow key={row.window} label={row.window} value={formatCents(row.exposureCents)} />
              ))}
              <InfoRow label="Worst-case loss" value={formatCents(data.risk.worstCaseLossCents)} tone="negative" />
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "execution" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SportsKpi label="Fill Rate" value={formatMaybePercent(data.execution.fillRate)} icon={<Gauge className="h-4 w-4" />} />
          <SportsKpi label="Cancel Rate" value={formatMaybePercent(data.execution.cancelRate)} icon={<Activity className="h-4 w-4" />} />
          <SportsKpi label="Partial Fill Rate" value={formatMaybePercent(data.execution.partialFillRate)} icon={<Activity className="h-4 w-4" />} />
          <SportsKpi label="Avg Time to Fill" value={formatMaybeMinutes(data.execution.averageTimeToFillMinutes)} icon={<Clock className="h-4 w-4" />} />
          <SportsKpi label="Avg Spread" value={formatMaybeClv(data.execution.averageSpreadCents)} />
          <SportsKpi label="Avg Slippage" value={formatMaybeClv(data.execution.averageSlippageCents)} tone={toneForNumber(data.execution.averageSlippageCents == null ? null : -data.execution.averageSlippageCents)} />
          <SportsKpi label="Fees" value={formatCents(data.execution.feesCents)} tone="negative" />
          <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 md:col-span-2 xl:col-span-1">
            <EmptyState title="Orderbook coverage" detail="Spread, midpoint, and slippage populate only when snapshots exist near fill time." />
          </section>
        </div>
      ) : null}

      {activeTab === "behavior" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Sports Behavior Alerts
            </h2>
            <div className="mt-4 divide-y divide-slate-800">
              {data.behavior.alerts.length === 0 ? (
                <EmptyState title="No behavior data yet" detail="Behavior detection will run after sports fills and settlements are imported." />
              ) : (
                data.behavior.alerts.map((alert) => (
                  <div key={alert.id} className="py-3">
                    <div className={alert.tone === "negative" ? "font-medium text-red-300" : alert.tone === "positive" ? "font-medium text-emerald-300" : "font-medium text-slate-100"}>
                      {alert.title}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{alert.detail}</p>
                  </div>
                ))
              )}
            </div>
          </section>
          <TeamBiasTable rows={data.behavior.teamBias} />
        </div>
      ) : null}
    </div>
  );
}

function SportsDiagnosticsPanel({ diagnostics }: { diagnostics: SportsAnalyticsData["diagnostics"] }) {
  return (
    <section className="rounded-lg border border-amber-500/25 bg-amber-950/10 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            Sports classification diagnostics
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1">{diagnostics.totalImportedFills} imported fills</span>
            <span className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1">{diagnostics.classifiedSportsFills} sports-classified fills</span>
          </div>
        </div>
        {diagnostics.classificationWarnings.length ? (
          <div className="max-w-3xl space-y-1 text-sm text-amber-100/90">
            {diagnostics.classificationWarnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </div>

      {diagnostics.unclassifiedFillSamples.length ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Market</th>
                <th className="px-3 py-3 font-medium">Event</th>
                <th className="px-3 py-3 font-medium">Title</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.unclassifiedFillSamples.map((sample) => (
                <tr key={`${sample.marketTicker}:${sample.eventTicker ?? "event"}`} className="border-t border-slate-800 bg-slate-950/60">
                  <td className="px-3 py-3 font-mono text-xs text-slate-300">{sample.marketTicker}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-400">{sample.eventTicker ?? "--"}</td>
                  <td className="px-3 py-3 text-slate-200">{sample.title ?? "--"}</td>
                  <td className="px-3 py-3 text-slate-400">{sample.category ?? "--"}</td>
                  <td className="px-3 py-3 text-slate-400">{sample.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function SportsKpi({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  icon?: React.ReactNode;
}) {
  const toneClass = tone === "positive" ? "text-emerald-300" : tone === "negative" ? "text-red-300" : "text-slate-100";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-lg shadow-black/10">
      <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-normal text-slate-500">
        <span>{label}</span>
        {icon ? <span className="text-slate-500">{icon}</span> : null}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  empty,
  emptyTitle,
  className = "xl:col-span-7",
  children,
}: {
  title: string;
  empty: boolean;
  emptyTitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-slate-950/80 p-4 ${className}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4 h-72">{empty ? <EmptyState title={emptyTitle} detail="This widget will populate after real Kalshi sports data is imported." /> : children}</div>
    </section>
  );
}

function ChartTooltip() {
  return <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0" }} />;
}

function PerformanceTable({ rows, title }: { rows: SportsAnalyticsData["overview"]["favoritePerformance"]; title: string }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-12">
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState title="No bucket performance yet" detail="Entry price bucket analytics will populate after sports fills settle." />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Bucket</th>
                <th className="px-3 py-3 font-medium">Fills</th>
                <th className="px-3 py-3 font-medium">P/L</th>
                <th className="px-3 py-3 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.bucket} className="border-t border-slate-800">
                  <td className="px-3 py-3 text-slate-200">{row.bucket}</td>
                  <td className="px-3 py-3 text-slate-200">{row.fills}</td>
                  <td className={`px-3 py-3 ${row.realizedPnlCents >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCents(row.realizedPnlCents, { signed: true })}</td>
                  <td className="px-3 py-3 text-slate-200">{formatMaybePercent(row.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TeamBiasTable({ rows }: { rows: SportsAnalyticsData["behavior"]["teamBias"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
      <h2 className="text-base font-semibold">Team Bias Table</h2>
      {rows.length === 0 ? (
        <EmptyState title="No team bias data yet" detail="Team-level fill and P/L analytics will appear after sports metadata is classified." />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Team</th>
                <th className="px-3 py-3 font-medium">Fills</th>
                <th className="px-3 py-3 font-medium">P/L</th>
                <th className="px-3 py-3 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.team} className="border-t border-slate-800">
                  <td className="px-3 py-3 text-slate-200">{row.team}</td>
                  <td className="px-3 py-3 text-slate-200">{row.fills}</td>
                  <td className={`px-3 py-3 ${row.realizedPnlCents >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCents(row.realizedPnlCents, { signed: true })}</td>
                  <td className="px-3 py-3 text-slate-200">{formatMaybePercent(row.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EntryTimingTable({ rows }: { rows: SportsAnalyticsData["clv"]["entryTiming"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-12">
      <h2 className="text-base font-semibold">Entry Timing Performance</h2>
      {rows.every((row) => row.fills === 0) ? (
        <EmptyState title="No entry timing data yet" detail="Timing analytics require sports fills with close-time metadata." />
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {rows.map((row) => (
            <div key={row.bucket} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs uppercase tracking-normal text-slate-500">{row.bucket}</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">{row.fills} fills</div>
              <div className={`mt-1 text-sm ${row.realizedPnlCents >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatCents(row.realizedPnlCents, { signed: true })}</div>
              <div className="mt-1 text-xs text-slate-500">Avg CLV {formatMaybeClv(row.averageClvCents)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ExposureList({ title, rows, icon }: { title: string; rows: Array<{ label: string; exposureCents: number }>; icon: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <EmptyState title="No open exposure" detail="Open sports positions will populate this view." />
        ) : (
          rows.slice(0, 8).map((row) => <InfoRow key={row.label} label={row.label} value={formatCents(row.exposureCents)} />)
        )}
      </div>
    </section>
  );
}

function SameGameExposure({ rows }: { rows: SportsAnalyticsData["risk"]["byEvent"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-8">
      <h2 className="text-base font-semibold">Same-game Exposure Panel</h2>
      {rows.length === 0 ? (
        <EmptyState title="No same-game exposure" detail="Open event and market positions will appear here when sports exposure exists." />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Event</th>
                <th className="px-3 py-3 font-medium">Ticker</th>
                <th className="px-3 py-3 font-medium">Exposure</th>
                <th className="px-3 py-3 font-medium">Resolves</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.eventTicker} className="border-t border-slate-800">
                  <td className="px-3 py-3 text-slate-200">{row.eventName}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-400">{row.eventTicker}</td>
                  <td className="px-3 py-3 text-slate-200">{formatCents(row.exposureCents)}</td>
                  <td className="px-3 py-3 text-slate-400">{row.resolvesAt ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(row.resolvesAt)) : "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InfoRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
      <span className="truncate text-slate-400">{label}</span>
      <span className={tone === "positive" ? "font-medium text-emerald-300" : tone === "negative" ? "font-medium text-red-300" : "font-medium text-slate-100"}>{value}</span>
    </div>
  );
}

function formatMaybeCents(value: number | null | undefined, signed = false) {
  return value == null ? "--" : formatCents(Math.round(value), { signed });
}

function formatMaybePercent(value: number | null | undefined) {
  return value == null ? "--" : formatPercent(value);
}

function formatMaybeClv(value: number | null | undefined) {
  if (value == null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}c`;
}

function formatMaybeMinutes(value: number | null | undefined) {
  if (value == null) return "--";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}m`;
}

function toneForCents(value: number | null | undefined) {
  if (value == null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function toneForNumber(value: number | null | undefined) {
  if (value == null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}
