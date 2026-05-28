import { describe, expect, it } from "vitest";
import { syncStatusMessage } from "./data";

describe("sync status messages", () => {
  it("uses explicit terminal and timeout messages", () => {
    expect(syncStatusMessage({ status: "running", timedOut: true, continuationRequired: false, error: null })).toBe(
      "Backfill may have timed out; resume or try again.",
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
