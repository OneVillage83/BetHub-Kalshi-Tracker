import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/settings/kalshi-credentials/adopt-netlify-key", () => {
  it("returns 401 when Clerk is not configured", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Unauthorized");
  });
});
