export type NormalizedOutcomeSide = "yes" | "no" | "unknown";
export type NormalizedOrderStatus = "resting" | "executed" | "canceled" | "unknown";

export function parseFixedPoint(value: unknown, fallback = "0") {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

export function dollarsToCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string" || !value.trim()) return 0;
  return Math.round(Number(value) * 100);
}

export function normalizeOutcomeSide(value: unknown): NormalizedOutcomeSide {
  if (value === "yes") return "yes";
  if (value === "no") return "no";
  return "unknown";
}

export function normalizeOrderStatus(value: unknown): NormalizedOrderStatus {
  if (value === "resting") return "resting";
  if (value === "executed") return "executed";
  if (value === "canceled") return "canceled";
  return "unknown";
}
