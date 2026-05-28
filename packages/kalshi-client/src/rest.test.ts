import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KalshiRestClient } from "./rest";

describe("KalshiRestClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks non-GET requests while read-only mode is enabled", async () => {
    const client = new KalshiRestClient({
      baseUrl: "https://external-api.kalshi.com/trade-api/v2",
      accessKeyId: "test",
      privateKeyPem: "unused",
    });

    await expect(client.request({ path: "/portfolio/orders", method: "POST" })).rejects.toThrow("Read-only Kalshi client blocked POST");
  });

  it("retains market and event positions across paginated responses", async () => {
    const privateKeyPem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;
    const pages = [
      {
        cursor: "next",
        market_positions: [{ market_ticker: "KXMARKET-1" }],
        event_positions: [{ event_ticker: "KXCOMBO" }],
      },
      {
        market_positions: [{ market_ticker: "KXMARKET-2" }],
        event_positions: [{ event_ticker: "KXCOMBO2" }],
      },
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const page = pages.shift();
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = new KalshiRestClient({
      baseUrl: "https://external-api.kalshi.com/trade-api/v2",
      accessKeyId: "test",
      privateKeyPem,
    });

    const positions = await client.getAllPositions({ count_filter: "position,total_traded" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(positions.marketPositions).toEqual([{ market_ticker: "KXMARKET-1" }, { market_ticker: "KXMARKET-2" }]);
    expect(positions.eventPositions).toEqual([{ event_ticker: "KXCOMBO" }, { event_ticker: "KXCOMBO2" }]);
  });

  it("passes repeated query params for multiple market orderbooks", async () => {
    const privateKeyPem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ orderbooks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = new KalshiRestClient({
      baseUrl: "https://external-api.kalshi.com/trade-api/v2",
      accessKeyId: "test",
      privateKeyPem,
    });

    await client.getMultipleMarketOrderbooks(["KXNBA-1", "KXNBA-2"]);

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/trade-api/v2/markets/orderbooks");
    expect(url.searchParams.getAll("tickers")).toEqual(["KXNBA-1", "KXNBA-2"]);
  });
});
