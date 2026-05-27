export function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-emerald-300" : tone === "negative" ? "text-red-300" : "text-slate-100";

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 shadow-lg shadow-black/10">
      <div className="text-xs uppercase tracking-normal text-slate-500">{label}</div>
      <div className={`mt-3 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
