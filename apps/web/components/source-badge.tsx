import type { ApiMeta } from "../lib/api-response";

export function SourceBadge({ meta }: { meta?: Partial<ApiMeta> }) {
  if (!meta || meta.source !== "stub") {
    return (
      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
        DB
      </span>
    );
  }

  return (
    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300">
      Stub: {meta.stubReason ?? "pending external data"}
    </span>
  );
}
