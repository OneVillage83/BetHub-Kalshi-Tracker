import { describe, expect, it } from "vitest";
import { buildDashboardSummary, syncStatusMessage } from "./data";

describe("sync status messages", () => {
  it("uses explicit terminal and timeout messages", () => {
    expect(syncStatusMessage({ status: "running", timedOut: true, continuationRequired: false, error: null })).toBe(
      "Backfill may have timed out; try again.",
    );
    expect(syncStatusMessage({ status: "running", timedOut: false, continuationRequired: true, error: null })).toBe(
      "Backfill is still running...",
    );
    expect(syncStatusMessage({ status: "success", timedOut: false, continuationRequired: false, error: null })).toBe(
      "Backfill completed.",
    );
    expect(syncStatusMessage({ status: "failed", timedOut: false, continuationRequired: false, error: "Nope" })).toBe(
      "Backfill failed: Nope",
    );
  });
});

describe("dashboard summary", () => {
  it("uses cash balance plus portfolio value for bankroll and open value", () => {
    const summary = buildDashboardSummary({
      latestBalance: { cashBalanceCents: 27015, portfolioValueCents: 1168 },
      balances: [{ capturedAt: new Date("2026-05-28T12:00:00.000Z"), cashBalanceCents: 27015, portfolioValueCents: 1168 }],
      positions: [
        { positionContracts: "1", realizedPnlCents: 100, feesPaidCents: 2 },
        { positionContracts: "1", realizedPnlCents: 100, feesPaidCents: 2 },
        { positionContracts: "1", realizedPnlCents: 100, feesPaidCents: 2 },
      ],
      eventPositions: [{ totalCostShares: "3", eventExposureCents: 1168, realizedPnlCents: 250, feesPaidCents: 5 }],
      settlements: [],
    });

    expect(summary.bankrollCents).toBe(28183);
    expect(summary.cashBalanceCents).toBe(27015);
    expect(summary.openExposureCents).toBe(1168);
    expect(summary.activePositions).toBe(1);
    expect(summary.realizedPnlCents).toBe(250);
  });
});
