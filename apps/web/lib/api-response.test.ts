import { describe, expect, it } from "vitest";
import { apiResponse } from "./api-response";

describe("apiResponse", () => {
  it("wraps data in the standard envelope", async () => {
    const response = apiResponse({ ok: true }, { source: "stub", stubReason: "awaiting Kalshi credentials" });
    const body = await response.json();

    expect(body.data).toEqual({ ok: true });
    expect(body.meta.source).toBe("stub");
    expect(body.meta.stubReason).toBe("awaiting Kalshi credentials");
    expect(body.meta.generatedAt).toEqual(expect.any(String));
  });
});
