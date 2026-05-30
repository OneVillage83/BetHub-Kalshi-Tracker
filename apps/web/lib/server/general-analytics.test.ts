import { describe, expect, it } from "vitest";
import { brierScore, chosenSidePriceCents, clvCents, drawdownSeries, priceBucketForCents } from "./general-analytics";

describe("general analytics helpers", () => {
  it("groups entry prices into analytics buckets", () => {
    expect(priceBucketForCents(12)).toBe("0-25c");
    expect(priceBucketForCents(31)).toBe("25-45c");
    expect(priceBucketForCents(50)).toBe("45-55c");
    expect(priceBucketForCents(70)).toBe("55-75c");
    expect(priceBucketForCents(88)).toBe("75-100c");
  });

  it("uses NO chosen-side prices for CLV", () => {
    expect(chosenSidePriceCents("no", 38)).toBe(62);
    expect(clvCents("no", 58, 36)).toBe(6);
    expect(clvCents("yes", 42, 49)).toBe(7);
  });

  it("computes Brier score from entry probability and outcome", () => {
    expect(brierScore(70, true)).toBeCloseTo(0.09);
    expect(brierScore(70, false)).toBeCloseTo(0.49);
  });

  it("computes peak-to-trough drawdown series", () => {
    const series = drawdownSeries([
      { date: new Date("2026-05-01T00:00:00.000Z"), valueCents: 10000 },
      { date: new Date("2026-05-02T00:00:00.000Z"), valueCents: 12500 },
      { date: new Date("2026-05-03T00:00:00.000Z"), valueCents: 11000 },
      { date: new Date("2026-05-04T00:00:00.000Z"), valueCents: 13000 },
    ]);

    expect(series.map((point) => point.drawdownCents)).toEqual([0, 0, -1500, 0]);
  });
});
