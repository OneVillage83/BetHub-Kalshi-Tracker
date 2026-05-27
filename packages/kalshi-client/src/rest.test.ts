import { describe, expect, it } from "vitest";
import { KalshiRestClient } from "./rest";

describe("KalshiRestClient", () => {
  it("blocks non-GET requests while read-only mode is enabled", async () => {
    const client = new KalshiRestClient({
      baseUrl: "https://external-api.demo.kalshi.co/trade-api/v2",
      accessKeyId: "test",
      privateKeyPem: "unused",
    });

    await expect(client.request({ path: "/portfolio/orders", method: "POST" })).rejects.toThrow("Read-only Kalshi client blocked POST");
  });
});
