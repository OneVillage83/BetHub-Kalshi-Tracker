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
import { Activity, AlertTriangle, CalendarDays, Gauge, ShieldAlert, Target, TrendingUp } from "lucide-react";
import { EmptyState } from "./empty-state";
import { formatCents, formatPercent } from "../lib/format";
import type { GeneralAnalyticsData } from "../lib/server/general-analytics";

type AnalyticsTab = "performance" | "edge" | "risk" | "execution" | "behavior";
type EquityMode = "portfolio" | "realized" | "unrealized" | "deposits";

const tabs: Array<{ id: AnalyticsTab; label: string }> = [
  { id: "performance", label: "Performance" },
  { id: "edge", label: "Edge / Accuracy" },
  { id: "risk", label: "Risk" },
  { id: "execution", label: "Execution Quality" },
  { id: "behavior", label: "Behavior / Strategy" },
];

const equityModes: Array<{ id: EquityMode; label: string; key: "portfolioValueCents" | "realizedPnlCents" | "unrealizedPnlCents" | "depositsAdjustedEquityCents" }> = [
  { id: "portfolio", label: "Portfolio value", key: "portfolioValueCents" },
  { id: "realized", label: "Realized P/L", key: "realizedPnlCents" },
  { id: "unrealized", label: "Unrealized P/L", key: "unrealizedPnlCents" },
  { id: "deposits", label: "Deposits-adjusted", key: "depositsAdjustedEquityCents" },
];

export function GeneralAnalyticsTerminal({ data }: { data: GeneralAnalyticsData }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("performance");
  const [equityMode, setEquityMode] = useState<EquityMode>("portfolio");
  const selectedMode = equityModes.find((mode) => mode.id === equityMode) ?? equityModes[0];
  const equityData = useMemo(
    () =>
      data.performance.equity
        .map((point) => ({
          date: shortDate(point.date),
          value: point[selectedMode.key] == null ? null : (point[selectedMode.key] ?? 0) / 100,
        }))
        .filter((point) => point.value != null),
    [data.performance.equity, selectedMode],
  );
  const drawdownData = data.performance.drawdown.map((point) => ({ date: shortDate(point.date), drawdown: point.drawdownCents / 100 }));
  const waterfallData = data.performance.waterfall.map((row) => ({ label: row.label, value: row.valueCents / 100 }));
  const calibrationData = data.edge.calibration.map((row) => ({
    bucket: row.bucket,
    implied: Math.round(row.impliedProbability * 100),
    actual: row.actualWinRate == null ? null : Math.round(row.actualWinRate * 100),
  }));
  const brierData = data.edge.brierOverTime.map((row) => ({ date: shortDate(row.date), brier: row.brierScore }));
  const clvData = data.edge.clv.map((row) => ({ label: row.label, clv: row.averageClvCents, fills: row.fills }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <AnalyticsKpi label="Total P/L" value={formatMaybeCents(data.kpis.totalPnlCents, true)} tone={toneForCents(data.kpis.totalPnlCents)} icon={<TrendingUp className="h-4 w-4" />} />
        <AnalyticsKpi label="Realized P/L" value={formatMaybeCents(data.kpis.realizedPnlCents, true)} tone={toneForCents(data.kpis.realizedPnlCents)} />
        <AnalyticsKpi label="Unrealized P/L" value={formatMaybeCents(data.kpis.unrealizedPnlCents, true)} tone={toneForCents(data.kpis.unrealizedPnlCents)} />
        <AnalyticsKpi label="ROI" value={formatMaybePercent(data.kpis.roi)} tone={toneForNumber(data.kpis.roi)} />
        <AnalyticsKpi label="Max Drawdown" value={formatMaybeCents(data.kpis.maxDrawdownCents)} tone="negative" />
        <AnalyticsKpi label="Fee Drag" value={formatMaybeCents(data.kpis.feeDragCents)} tone="negative" />
      </div>

      {!data.hasData ? (
        <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
          <EmptyState title="No analytics data yet" detail="General analytics will populate after Kalshi fills, orders, positions, settlements, balances, and market data are imported." />
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

      {activeTab === "performance" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-base font-semibold">Equity Curve</h2>
              <div className="flex flex-wrap gap-2">
                {equityModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setEquityMode(mode.id)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${
                      equityMode === mode.id ? "border-blue-500/40 bg-blue-500/15 text-blue-200" : "border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 h-72">
              {equityMode === "deposits" ? (
                <EmptyState title="Deposits-adjusted equity unavailable" detail="This mode will populate once explicit deposit and withdrawal data is imported." />
              ) : equityData.length === 0 ? (
                <EmptyState title="No equity points" detail="Balance snapshots will populate this chart after backfill." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <ChartTooltip />
                    <Area type="monotone" dataKey="value" stroke="#38bdf8" fill="#2563eb" fillOpacity={0.28} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <ChartCard title="Drawdown Curve" empty={!drawdownData.length} emptyTitle="No drawdown data" className="xl:col-span-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="#7f1d1d" fillOpacity={0.28} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="P/L Waterfall" empty={!waterfallData.length} emptyTitle="No waterfall data" className="xl:col-span-12">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((row) => (
                    <Cell key={row.label} fill={row.value >= 0 ? "#14b8a6" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : null}

      {activeTab === "edge" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <ChartCard title="Calibration Curve" empty={!calibrationData.some((row) => row.actual != null)} emptyTitle="No settled calibration data" className="xl:col-span-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calibrationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="bucket" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <ChartTooltip />
                <Line type="monotone" dataKey="implied" stroke="#38bdf8" strokeWidth={2} />
                <Line type="monotone" dataKey="actual" stroke="#14b8a6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Brier Score Over Time" empty={!brierData.length} emptyTitle="No Brier score data" className="xl:col-span-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={brierData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Line type="monotone" dataKey="brier" stroke="#38bdf8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Closing Line Value" empty={!clvData.some((row) => row.clv != null)} emptyTitle="No CLV data" className="xl:col-span-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clvData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="clv" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <RoiBucketTable rows={data.edge.roiByBucketSide} />
        </div>
      ) : null}

      {activeTab === "risk" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              Worst-case Scenario
            </h2>
            <div className="mt-4 space-y-3">
              <InfoRow label="Worst-case loss" value={formatCents(data.risk.worstCase.lossCents)} tone="negative" />
              <InfoRow label="Open markets" value={String(data.risk.worstCase.openMarkets)} />
              <InfoRow label="Largest event" value={formatCents(data.risk.worstCase.largestEventCents)} />
              <InfoRow label="Concentration" value={data.risk.concentration.label} tone={riskTone(data.risk.concentration.level)} />
            </div>
          </section>
          <ExposureHeatmap rows={data.risk.exposureHeatmap} />
          <SettlementCalendar rows={data.risk.settlementCalendar} />
        </div>
      ) : null}

      {activeTab === "execution" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="grid gap-4 md:grid-cols-2 xl:col-span-12 xl:grid-cols-5">
            <AnalyticsKpi label="Fill Rate" value={formatMaybePercent(data.execution.stats.fillRate)} icon={<Gauge className="h-4 w-4" />} />
            <AnalyticsKpi label="Cancel Rate" value={formatMaybePercent(data.execution.stats.cancelRate)} icon={<Activity className="h-4 w-4" />} />
            <AnalyticsKpi label="Partial Fill Rate" value={formatMaybePercent(data.execution.stats.partialFillRate)} />
            <AnalyticsKpi label="Avg Time to Fill" value={formatSeconds(data.execution.stats.averageTimeToFillSeconds)} />
            <AnalyticsKpi label="Avg Slippage" value={formatMaybeClv(data.execution.stats.averageSlippageCents)} tone={toneForNumber(data.execution.stats.averageSlippageCents == null ? null : -data.execution.stats.averageSlippageCents)} />
          </div>
          <FillQualityTable rows={data.execution.fillQuality} />
          <ListCard title="Fee Drag by Category" rows={data.execution.feeDragByCategory} />
          <ListCard title="Fee Drag by Tag" rows={data.execution.feeDragByTag} />
        </div>
      ) : null}

      {activeTab === "behavior" ? (
        <div className="grid gap-4 xl:grid-cols-12">
          <ListCard title="P/L by Strategy Tag" rows={data.behavior.pnlByTag} className="xl:col-span-4" />
          <ChartCard title="P/L by Day of Week" empty={!data.behavior.pnlByDay.length} emptyTitle="No day-of-week data" className="xl:col-span-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.behavior.pnlByDay.map((row) => ({ label: row.label, pnl: row.valueCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="pnl" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <AfterWinLoss rows={data.behavior.afterWinLoss} />
          <ChartCard title="P/L by Hour" empty={!data.behavior.pnlByHour.some((row) => row.valueCents !== 0)} emptyTitle="No hourly behavior data" className="xl:col-span-7">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.behavior.pnlByHour.map((row) => ({ hour: row.hour, pnl: row.valueCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="hour" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <ChartTooltip />
                <Bar dataKey="pnl" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <BehaviorAlerts alerts={data.behavior.alerts} />
        </div>
      ) : null}
    </div>
  );
}

function AnalyticsKpi({
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
        {icon ? <span>{icon}</span> : null}
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
      <div className="mt-4 h-72">{empty ? <EmptyState title={emptyTitle} detail="This widget will populate after real Kalshi analytics data is imported." /> : children}</div>
    </section>
  );
}

function RoiBucketTable({ rows }: { rows: GeneralAnalyticsData["edge"]["roiByBucketSide"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-7">
      <h2 className="text-base font-semibold">ROI by Price Bucket and Side</h2>
      {rows.length === 0 ? (
        <EmptyState title="No ROI bucket data" detail="Settled fills are required for ROI by bucket and side." />
      ) : (
        <DataGrid
          headers={["Bucket", "Side", "Fills", "P/L", "ROI"]}
          rows={rows.map((row) => [row.bucket, row.side.toUpperCase(), row.fills, signedCents(row.realizedPnlCents), formatMaybePercent(row.roi)])}
        />
      )}
    </section>
  );
}

function ExposureHeatmap({ rows }: { rows: GeneralAnalyticsData["risk"]["exposureHeatmap"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-8">
      <h2 className="text-base font-semibold">Exposure Heatmap</h2>
      {rows.length === 0 ? (
        <EmptyState title="No open exposure" detail="Open positions will populate exposure by category, event, close date, and side." />
      ) : (
        <DataGrid
          headers={["Category", "Event", "Close", "Side", "Exposure"]}
          rows={rows.slice(0, 20).map((row) => [row.category, row.event, row.closeDate ? shortDate(row.closeDate) : "Unknown", row.side.toUpperCase(), formatCents(row.exposureCents)])}
        />
      )}
    </section>
  );
}

function SettlementCalendar({ rows }: { rows: GeneralAnalyticsData["risk"]["settlementCalendar"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-12">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <CalendarDays className="h-4 w-4 text-blue-300" />
        Settlement Calendar
      </h2>
      {rows.length === 0 ? (
        <EmptyState title="No resolving exposure" detail="Markets with close dates and open exposure will populate this calendar." />
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {rows.slice(0, 12).map((row) => (
            <div key={row.date} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs text-slate-500">{shortDate(row.date)}</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">{formatCents(row.exposureCents)}</div>
              <div className="mt-1 text-xs text-slate-500">{row.settlementCount} markets</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FillQualityTable({ rows }: { rows: GeneralAnalyticsData["execution"]["fillQuality"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-8">
      <h2 className="text-base font-semibold">Fill Quality Table</h2>
      {rows.length === 0 ? (
        <EmptyState title="No fill quality data" detail="Matched fills and orderbook snapshots will populate this table." />
      ) : (
        <DataGrid
          headers={["Market", "Side", "Entry", "Mid", "Spread", "Slippage", "Fee", "Time"]}
          rows={rows.map((row) => [
            row.marketTicker,
            row.side.toUpperCase(),
            cents(row.entryPriceCents),
            row.midpointCents == null ? "--" : cents(row.midpointCents),
            row.spreadCents == null ? "--" : `${row.spreadCents}c`,
            row.slippageCents == null ? "--" : formatMaybeClv(row.slippageCents),
            formatCents(row.feeCents),
            formatSeconds(row.timeToFillSeconds),
          ])}
        />
      )}
    </section>
  );
}

function ListCard({
  title,
  rows,
  className = "xl:col-span-4",
}: {
  title: string;
  rows: Array<{ label: string; valueCents: number }>;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-slate-950/80 p-4 ${className}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <EmptyState title="No data yet" detail="This view will populate after tagged or categorized trades are imported." />
        ) : (
          rows.slice(0, 10).map((row) => <InfoRow key={row.label} label={row.label} value={signedCents(row.valueCents)} tone={toneForCents(row.valueCents)} />)
        )}
      </div>
    </section>
  );
}

function AfterWinLoss({ rows }: { rows: GeneralAnalyticsData["behavior"]["afterWinLoss"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-4">
      <h2 className="text-base font-semibold">Performance After Wins/Losses</h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <EmptyState title="No sequence data" detail="Settled trade sequences are required for post-win/loss analytics." />
        ) : (
          rows.map((row) => (
            <div key={row.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-sm font-medium text-slate-100">{row.label}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                <span>{row.fills} fills</span>
                <span>{formatCents(row.averageCostCents)} avg</span>
                <span className={row.realizedPnlCents >= 0 ? "text-emerald-300" : "text-red-300"}>{signedCents(row.realizedPnlCents)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function BehaviorAlerts({ alerts }: { alerts: GeneralAnalyticsData["behavior"]["alerts"] }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-300" />
        Tilt Detector
      </h2>
      <div className="mt-4 divide-y divide-slate-800">
        {alerts.length === 0 ? (
          <EmptyState title="No behavior data" detail="Behavior alerts will populate after settled trade sequences exist." />
        ) : (
          alerts.map((alert) => (
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
  );
}

function DataGrid({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-normal text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-slate-800">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-3 text-slate-200">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function ChartTooltip() {
  return <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0" }} />;
}

function formatMaybeCents(value: number | null | undefined, signed = false) {
  return value == null ? "--" : formatCents(Math.round(value), { signed });
}

function signedCents(value: number) {
  return formatCents(value, { signed: true });
}

function cents(value: number) {
  return `${value}c`;
}

function formatMaybePercent(value: number | null | undefined) {
  return value == null ? "--" : formatPercent(value);
}

function formatMaybeClv(value: number | null | undefined) {
  if (value == null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}c`;
}

function formatSeconds(value: number | null | undefined) {
  if (value == null) return "--";
  if (value < 60) return `${Math.round(value)}s`;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value / 60)}m`;
}

function toneForCents(value: number | null | undefined) {
  if (value == null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function toneForNumber(value: number | null | undefined) {
  if (value == null || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function riskTone(level: GeneralAnalyticsData["risk"]["concentration"]["level"]) {
  if (level === "green") return "positive";
  if (level === "red") return "negative";
  return "neutral";
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}
