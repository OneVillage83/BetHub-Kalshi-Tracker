import { DatabaseZap } from "lucide-react";

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/70 p-6 text-center">
      <DatabaseZap className="h-6 w-6 text-slate-500" />
      <h3 className="mt-3 text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{detail}</p>
    </div>
  );
}
