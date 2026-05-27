import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("escapes commas, quotes, and newlines", () => {
    const csv = toCsv([{ market: 'Fed, "cut"\nsoon', pnl: 12 }], ["market", "pnl"]);
    expect(csv).toBe('market,pnl\n"Fed, ""cut""\nsoon",12');
  });
});
