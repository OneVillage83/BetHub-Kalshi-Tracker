import { describe, expect, it } from "vitest";
import {
  applyBackfillProgress,
  BACKFILL_STALE_MS,
  buildCoreBackfillImportPayload,
  buildMissingCredentialsBackfillStats,
  fetchOptionalEventMetadata,
  isBackfillProgressStale,
  isRecoverableCoreImportStats,
  type NormalizedEventPosition,
  type NormalizedFill,
  type NormalizedOrder,
  type NormalizedPosition,
  type NormalizedSettlement,
} from "./backfill";

describe("backfill progress helpers", () => {
  it("records missing credentials as a zero-percent setup state", () => {
    const stats = buildMissingCredentialsBackfillStats();

    expect(stats.stage).toBe("credentials");
    expect(stats.percent).toBe(0);
    expect(stats.stageLabel).toContain("credentials");
    expect(stats.counts.fills).toBe(0);
  });

  it("updates staged progress with current import counts", () => {
    const stats = buildMissingCredentialsBackfillStats();
    stats.fills = 2;
    stats.historicalFills = 3;
    stats.orders = 1;

    const progress = applyBackfillProgress(stats, "fills");

    expect(progress.stage).toBe("fills");
    expect(progress.percent).toBe(24);
    expect(progress.counts.fills).toBe(2);
    expect(progress.counts.historicalFills).toBe(3);
    expect(progress.counts.orders).toBe(1);
  });

  it("detects stale running progress", () => {
    const now = Date.parse("2026-05-28T04:00:00.000Z");

    expect(isBackfillProgressStale("2026-05-28T03:56:59.000Z", now)).toBe(true);
    expect(isBackfillProgressStale(new Date(now - BACKFILL_STALE_MS + 1000).toISOString(), now)).toBe(false);
  });

  it("treats missing event metadata as a non-fatal skip", async () => {
    const result = await fetchOptionalEventMetadata(
      {
        getEvent: async () => {
          throw new Error("Kalshi API 404: not found");
        },
      },
      "KXTEST",
      [],
    );

    expect(result.status).toBe("not_found");
    if (result.status !== "ok") expect(result.message).toContain("metadata was not found");
  });

  it("retries event metadata rate limits and returns a non-fatal result", async () => {
    let calls = 0;
    const result = await fetchOptionalEventMetadata(
      {
        getEvent: async () => {
          calls += 1;
          throw new Error('Kalshi API 429: {"error":{"code":"too_many_requests"}}');
        },
      },
      "KXTEST",
      [0, 0],
    );

    expect(calls).toBe(3);
    expect(result.status).toBe("rate_limited");
    if (result.status !== "ok") expect(result.message).toContain("core import continues");
  });

  it("treats event metadata server errors as non-fatal metadata results", async () => {
    const result = await fetchOptionalEventMetadata(
      {
        getEvent: async () => {
          throw new Error("Kalshi API 500: server error");
        },
      },
      "KXTEST",
      [],
    );

    expect(result.status).toBe("error");
    if (result.status !== "ok") expect(result.message).toContain("Kalshi API 500");
  });

  it("identifies failed database-import runs as recoverable candidates", () => {
    expect(
      isRecoverableCoreImportStats({
        stage: "database_import",
        percent: 94,
        counts: { balanceSnapshots: 1 },
      }),
    ).toBe(true);
  });

  it("builds a deduped batched import payload with event positions and placeholder references", () => {
    const createdTime = new Date("2026-05-28T12:00:00.000Z");
    const fills: NormalizedFill[] = [
      {
        fillId: "fill-1",
        tradeId: "trade-1",
        orderId: "order-1",
        marketTicker: "KXMARKET-1",
        eventTicker: "KXEVENT-1",
        outcomeSide: "yes",
        action: "buy",
        contractCount: "2",
        priceCents: 40,
        feeCents: 1,
        createdTime,
        source: "portfolio",
        rawJson: { fill_id: "fill-1" },
      },
      {
        fillId: "fill-1",
        tradeId: "trade-1",
        orderId: "order-1",
        marketTicker: "KXMARKET-1",
        eventTicker: "KXEVENT-1",
        outcomeSide: "yes",
        action: "buy",
        contractCount: "2",
        priceCents: 40,
        feeCents: 1,
        createdTime,
        source: "historical",
        rawJson: { fill_id: "fill-1", source: "historical" },
      },
    ];
    const orders: NormalizedOrder[] = [
      {
        orderId: "order-1",
        marketTicker: "KXMARKET-1",
        eventTicker: "KXEVENT-1",
        outcomeSide: "yes",
        action: "buy",
        status: "executed",
        originalCount: "2",
        remainingCount: "0",
        filledCount: "2",
        priceCents: 40,
        createdTime,
        updatedTime: createdTime,
        source: "portfolio",
        rawJson: { order_id: "order-1" },
      },
    ];
    const positions: NormalizedPosition[] = [
      {
        marketTicker: "KXMARKET-1",
        eventTicker: "KXEVENT-1",
        positionContracts: "1",
        totalTraded: "2",
        averagePriceCents: 40,
        markPriceCents: 20,
        exposureCents: 20,
        realizedPnlCents: 0,
        unrealizedPnlCents: null,
        feesPaidCents: 1,
        rawJson: { ticker: "KXMARKET-1" },
      },
    ];
    const eventPositions: NormalizedEventPosition[] = [
      {
        eventTicker: "KXCOMBO",
        totalCostCents: 1233,
        totalCostShares: "59",
        eventExposureCents: 1168,
        realizedPnlCents: 0,
        feesPaidCents: 0,
        rawJson: { event_ticker: "KXCOMBO" },
      },
    ];
    const settlements: NormalizedSettlement[] = [
      {
        marketTicker: "KXMARKET-1",
        eventTicker: "KXEVENT-1",
        rawHash: "hash-1",
        settledTime: null,
        realizedPnlCents: null,
        revenueCents: null,
        feeCents: null,
        rawJson: { market_ticker: "KXMARKET-1" },
      },
      {
        marketTicker: "KXMARKET-1",
        eventTicker: "KXEVENT-1",
        rawHash: "hash-1",
        settledTime: null,
        realizedPnlCents: null,
        revenueCents: null,
        feeCents: null,
        rawJson: { market_ticker: "KXMARKET-1", duplicate: true },
      },
    ];

    const payload = buildCoreBackfillImportPayload("acct-1", {
      balance: { balance: 27015, portfolio_value: 1168 },
      fills,
      orders,
      positions,
      eventPositions,
      settlements,
      fallbackEventTickers: new Map([["KXMARKET-1", "KXEVENT-1"]]),
    });

    expect(payload.balanceSnapshot.cashBalanceCents).toBe(27015);
    expect(payload.balanceSnapshot.portfolioValueCents).toBe(1168);
    expect(payload.events.map((event) => event.ticker).sort()).toEqual(["KXCOMBO", "KXEVENT-1"]);
    expect(payload.markets).toHaveLength(1);
    expect(payload.fills).toHaveLength(1);
    expect(payload.orders).toHaveLength(1);
    expect(payload.positions).toHaveLength(1);
    expect(payload.eventPositions).toHaveLength(1);
    expect(payload.settlements).toHaveLength(1);
  });
});
