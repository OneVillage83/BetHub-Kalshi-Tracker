import { describe, expect, it } from "vitest";
import { buildEnsureMarketUpsertArgs, decimalToString } from "./index";

describe("db helpers", () => {
  it("builds idempotent market upsert arguments", () => {
    expect(buildEnsureMarketUpsertArgs("KXTEST", { ticker: "KXTEST" })).toEqual({
      where: { ticker: "KXTEST" },
      create: {
        ticker: "KXTEST",
        rawJson: { ticker: "KXTEST" },
      },
      update: {},
    });
  });

  it("formats decimal-like values without numeric coercion", () => {
    expect(decimalToString("10.2500")).toBe("10.2500");
    expect(decimalToString(null)).toBeNull();
  });
});
