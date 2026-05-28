import { describe, expect, it } from "vitest";
import {
  applyBackfillProgress,
  BACKFILL_STALE_MS,
  buildMissingCredentialsBackfillStats,
  fetchOptionalEventMetadata,
  isBackfillProgressStale,
} from "./backfill";

describe("backfill progress helpers", () => {
  it("records missing credentials as a zero-percent setup state", () => {
    const stats = buildMissingCredentialsBackfillStats();

    expect(stats.stage).toBe("credentials");
    expect(stats.percent).toBe(0);
    expect(stats.stageLabel).toContain("credentials");
    expect(stats.counts.fills).toBe(0);
  });

  it("updates staged progress with current import counts", () => {
    const stats = buildMissingCredentialsBackfillStats();
    stats.fills = 2;
    stats.historicalFills = 3;
    stats.orders = 1;

    const progress = applyBackfillProgress(stats, "fills");

    expect(progress.stage).toBe("fills");
    expect(progress.percent).toBe(24);
    expect(progress.counts.fills).toBe(2);
    expect(progress.counts.historicalFills).toBe(3);
    expect(progress.counts.orders).toBe(1);
  });

  it("detects stale running progress", () => {
    const now = Date.parse("2026-05-28T04:00:00.000Z");

    expect(isBackfillProgressStale("2026-05-28T03:56:59.000Z", now)).toBe(true);
    expect(isBackfillProgressStale(new Date(now - BACKFILL_STALE_MS + 1000).toISOString(), now)).toBe(false);
  });

  it("treats missing event metadata as a non-fatal skip", async () => {
    const result = await fetchOptionalEventMetadata(
      {
        getEvent: async () => {
          throw new Error("Kalshi API 404: not found");
        },
      },
      "KXTEST",
      [],
    );

    expect(result.status).toBe("not_found");
    if (result.status !== "ok") expect(result.message).toContain("metadata was not found");
  });

  it("retries event metadata rate limits and returns a non-fatal result", async () => {
    let calls = 0;
    const result = await fetchOptionalEventMetadata(
      {
        getEvent: async () => {
          calls += 1;
          throw new Error('Kalshi API 429: {"error":{"code":"too_many_requests"}}');
        },
      },
      "KXTEST",
      [0, 0],
    );

    expect(calls).toBe(3);
    expect(result.status).toBe("rate_limited");
    if (result.status !== "ok") expect(result.message).toContain("core import continues");
  });
});
