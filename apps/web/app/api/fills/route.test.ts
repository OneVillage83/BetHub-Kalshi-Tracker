import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/fills", () => {
  it("returns 401 when Clerk is not configured", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Unauthorized");
  });
});
