"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../empty-state";

export function DashboardCharts({
  equity,
  categories,
}: {
  equity: Array<{ date: string; valueCents: number }>;
  categories: Array<{ category: string; realizedPnlCents: number }>;
}) {
  const equityData = equity.map((point) => ({
    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(point.date)),
    value: point.valueCents / 100,
  }));
  const categoryData = categories.map((category) => ({
    category: category.category,
    pnl: category.realizedPnlCents / 100,
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-7">
        <h2 className="text-base font-semibold">Equity Curve</h2>
        <div className="mt-4 h-72">
          {equityData.length === 0 ? (
            <EmptyState title="No balance snapshots" detail="Run a backfill after Kalshi credentials are configured." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0" }} />
                <Area type="monotone" dataKey="value" stroke="#38bdf8" fill="#2563eb" fillOpacity={0.28} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 xl:col-span-5">
        <h2 className="text-base font-semibold">P/L by Category</h2>
        <div className="mt-4 h-72">
          {categoryData.length === 0 ? (
            <EmptyState title="No category P/L yet" detail="Market enrichment will populate categories once real Kalshi data is imported." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="category" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0" }} />
                <Bar dataKey="pnl" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
