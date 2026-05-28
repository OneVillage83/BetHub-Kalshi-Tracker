export type NormalizedOutcomeSide = "yes" | "no" | "unknown";
export type NormalizedOrderStatus = "resting" | "executed" | "canceled" | "unknown";

export function parseFixedPoint(value: unknown, fallback = "0") {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return value.trim();
  return fallback;
}

export function dollarsToCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string" || !value.trim()) return 0;
  const dollars = Number(value);
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

export function normalizeOutcomeSide(value: unknown): NormalizedOutcomeSide {
  const normalized = typeof value === "string" ? value.toLowerCase() : value;
  if (normalized === "yes") return "yes";
  if (normalized === "no") return "no";
  return "unknown";
}

export function normalizeOrderStatus(value: unknown): NormalizedOrderStatus {
  const normalized = typeof value === "string" ? value.toLowerCase() : value;
  if (normalized === "resting") return "resting";
  if (normalized === "executed") return "executed";
  if (normalized === "canceled") return "canceled";
  return "unknown";
}
