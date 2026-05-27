import { describe, expect, it } from "vitest";
import { dollarsToCents, normalizeOrderStatus, normalizeOutcomeSide, parseFixedPoint } from "./normalizers";

describe("normalizers", () => {
  it("keeps fixed-point quantities decimal-safe", () => {
    expect(parseFixedPoint("10.25")).toBe("10.25");
    expect(parseFixedPoint(3.5)).toBe("3.5");
    expect(parseFixedPoint(null)).toBe("0");
  });

  it("converts dollar strings into integer cents", () => {
    expect(dollarsToCents("0.5600")).toBe(56);
    expect(dollarsToCents("1.235")).toBe(124);
  });

  it("normalizes known enums and falls back safely", () => {
    expect(normalizeOutcomeSide("yes")).toBe("yes");
    expect(normalizeOutcomeSide("maybe")).toBe("unknown");
    expect(normalizeOrderStatus("executed")).toBe("executed");
    expect(normalizeOrderStatus("pending")).toBe("unknown");
  });
});
