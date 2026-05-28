import { describe, expect, it } from "vitest";
import { backfillResponseStatus } from "./route";

describe("backfill response status", () => {
  it("returns 202 for stubbed or still-running backfills", () => {
    expect(backfillResponseStatus({ status: "stub" }, { source: "stub" })).toBe(202);
    expect(backfillResponseStatus({ status: "running" }, { source: "db" })).toBe(202);
    expect(backfillResponseStatus({ status: "running", continuationRequired: true }, { source: "db" })).toBe(202);
  });

  it("returns 200 for completed DB backfills", () => {
    expect(backfillResponseStatus({ status: "success" }, { source: "db" })).toBe(200);
  });
});
