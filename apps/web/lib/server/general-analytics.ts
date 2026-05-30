import { getPrisma } from "@kalshi-tracker/db";
import { dollarsToCents, type KalshiRestClient } from "@kalshi-tracker/kalshi-client";
import { Prisma, type OrderStatus, type OutcomeSide } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

const ONE_MINUTE_MS = 60 * 1000;
const CANDLE_PERIOD_MINUTES = 1;
const CANDLE_PADDING_SECONDS = 120;
const MAX_CANDLE_RANGES_PER_SYNC = 240;
const ORDERBOOK_SNAPSHOT_DISTANCE_MS = 5 * ONE_MINUTE_MS;

type MarketInput = {
  ticker: string;
  eventTicker?: string | null;
  title?: string | null;
  category?: string | null;
  closeTime?: Date | null;
  expirationTime?: Date | null;
  settlementTime?: Date | null;
  rawJson?: unknown;
  event?: { ticker: string; title?: string | null; category?: string | null } | null;
};

type FillInput = {
  fillId: string;
  orderId: string | null;
  kalshiAccountId: string;
  marketTicker: string;
  eventTicker: string | null;
  outcomeSide: OutcomeSide;
  action: string | null;
  contractCount: unknown;
  priceCents: number;
  feeCents: number;
  createdTime: Date;
  market: MarketInput;
};

type OrderInput = {
  orderId: string;
  marketTicker: string;
  status: OrderStatus;
  originalCount: unknown;
  remainingCount: unknown;
  filledCount: unknown;
  priceCents: number | null;
  createdTime: Date | null;
  updatedTime: Date | null;
};

type PositionInput = {
  marketTicker: string;
  eventTicker: string | null;
  positionContracts: unknown;
  exposureCents: number | null;
  realizedPnlCents: number;
  unrealizedPnlCents: number | null;
  feesPaidCents: number;
  market: MarketInput;
};

type EventPositionInput = {
  eventTicker: string;
  totalCostShares: unknown;
  eventExposureCents: number | null;
  realizedPnlCents: number;
  feesPaidCents: number;
  event: { ticker: string; title?: string | null; category?: string | null } | null;
};

type SettlementInput = {
  marketTicker: string;
  eventTicker: string | null;
  settledTime: Date | null;
  realizedPnlCents: number | null;
  revenueCents: number | null;
  feeCents: number | null;
  market: MarketInput;
};

type BalanceInput = {
  capturedAt: Date;
  cashBalanceCents: number | null;
  portfolioValueCents: number | null;
};

type NoteInput = {
  marketTicker: string | null;
  fillId: string | null;
  tags: string[];
};

type CandleInput = {
  marketTicker: string;
  endPeriod: Date;
  priceCloseCents: number | null;
};

type OrderbookInput = {
  marketTicker: string;
  observedAt: Date;
  midpointCents: number | null;
  spreadCents: number | null;
};

type ClassifiedFill = {
  fillId: string;
  orderId: string | null;
  marketTicker: string;
  eventTicker: string | null;
  category: string;
  tags: string[];
  side: OutcomeSide;
  action: string | null;
  entryPriceCents: number;
  priceBucket: string;
  contractCount: number;
  costCents: number;
  feeCents: number;
  createdTime: Date;
  closeTime: Date | null;
  clv1hCents: number | null;
  clv24hCents: number | null;
  clvCloseCents: number | null;
  brierScore: number | null;
  settled: boolean;
  won: boolean | null;
  realizedPnlCents: number | null;
  orderCreatedAt: Date | null;
  timeToFillSeconds: number | null;
  nearestOrderbookObservedAt: Date | null;
  midpointCents: number | null;
  spreadCents: number | null;
  slippageCents: number | null;
};

type DailyRollup = {
  date: Date;
  equityCents: number;
  cashBalanceCents: number;
  portfolioValueCents: number;
  realizedPnlCents: number;
  unrealizedPnlCents: number;
  totalPnlCents: number;
  grossPnlCents: number;
  feesCents: number;
  exposureCents: number;
  drawdownCents: number;
  costBasisCents: number;
  fillCount: number;
  orderCount: number;
  settlementCount: number;
};

type PositionMetric = {
  marketTicker: string;
  eventTicker: string | null;
  category: string;
  side: OutcomeSide;
  positionContracts: number;
  exposureCents: number;
  unrealizedPnlCents: number;
  realizedPnlCents: number;
  worstCaseLossCents: number;
  closeDate: Date | null;
  concentrationWeight: number | null;
};

type OrderStats = {
  fillRate: number | null;
  cancelRate: number | null;
  partialFillRate: number | null;
};

export type GeneralAnalyticsData = {
  hasData: boolean;
  kpis: {
    totalPnlCents: number | null;
    realizedPnlCents: number | null;
    unrealizedPnlCents: number | null;
    roi: number | null;
    maxDrawdownCents: number | null;
    feeDragCents: number | null;
  };
  performance: {
    equity: Array<{
      date: string;
      portfolioValueCents: number;
      realizedPnlCents: number;
      unrealizedPnlCents: number;
      depositsAdjustedEquityCents: number | null;
    }>;
    drawdown: Array<{ date: string; drawdownCents: number }>;
    waterfall: Array<{ label: string; valueCents: number }>;
  };
  edge: {
    calibration: Array<{ bucket: string; impliedProbability: number; actualWinRate: number | null; fills: number }>;
    brierOverTime: Array<{ date: string; brierScore: number }>;
    clv: Array<{ label: string; averageClvCents: number | null; fills: number }>;
    roiByBucketSide: Array<{ bucket: string; side: "yes" | "no" | "unknown"; fills: number; roi: number | null; realizedPnlCents: number }>;
  };
  risk: {
    exposureHeatmap: Array<{ category: string; event: string; closeDate: string | null; side: string; exposureCents: number }>;
    settlementCalendar: Array<{ date: string; exposureCents: number; settlementCount: number }>;
    worstCase: { lossCents: number; openMarkets: number; largestEventCents: number };
    concentration: { score: number | null; level: "green" | "yellow" | "red" | "unknown"; label: string };
  };
  execution: {
    fillQuality: Array<{
      fillId: string;
      marketTicker: string;
      category: string;
      side: string;
      entryPriceCents: number;
      midpointCents: number | null;
      spreadCents: number | null;
      slippageCents: number | null;
      feeCents: number;
      timeToFillSeconds: number | null;
    }>;
    stats: {
      fillRate: number | null;
      cancelRate: number | null;
      partialFillRate: number | null;
      averageTimeToFillSeconds: number | null;
      averageSlippageCents: number | null;
    };
    feeDragByCategory: Array<{ label: string; valueCents: number }>;
    feeDragByTag: Array<{ label: string; valueCents: number }>;
  };
  behavior: {
    pnlByTag: Array<{ label: string; valueCents: number }>;
    pnlByDay: Array<{ label: string; valueCents: number }>;
    pnlByHour: Array<{ hour: string; valueCents: number }>;
    afterWinLoss: Array<{ label: string; fills: number; averageCostCents: number; realizedPnlCents: number }>;
    alerts: Array<{ id: string; title: string; detail: string; tone: "positive" | "negative" | "neutral" }>;
  };
};

export type GeneralAnalyticsEnrichmentResult = {
  analyticsDailyRollups: number;
  analyticsFillMetrics: number;
  analyticsPositionMetrics: number;
  candlesticks: number;
  orderbookSnapshots: number;
  warnings: string[];
};

export async function enrichGeneralAnalytics(args: {
  prisma: ReturnType<typeof getPrisma>;
  client: KalshiRestClient;
  appUserId: string;
  kalshiAccountId: string;
}): Promise<GeneralAnalyticsEnrichmentResult> {
  const warnings: string[] = [];
  const raw = await loadRawAnalyticsInput(args.appUserId, [args.kalshiAccountId], args.prisma);
  const candlestickCount = await importTargetedCandlesticks(args.prisma, args.client, raw.fills, warnings);
  const orderbookCount = await importOpenOrderbooks(args.prisma, args.client, raw.positions, raw.eventPositions, warnings);
  const refreshed = await loadRawAnalyticsInput(args.appUserId, [args.kalshiAccountId], args.prisma);
  const metrics = buildAnalyticsMetrics(refreshed);
  await persistAnalyticsMetrics(args.prisma, args.kalshiAccountId, metrics);

  return {
    analyticsDailyRollups: metrics.dailyRollups.length,
    analyticsFillMetrics: metrics.fills.length,
    analyticsPositionMetrics: metrics.positions.length,
    candlesticks: candlestickCount,
    orderbookSnapshots: orderbookCount,
    warnings,
  };
}

export async function getGeneralAnalytics(appUserId: string): Promise<GeneralAnalyticsData> {
  const prisma = getPrisma();
  const accounts = await prisma.kalshiAccount.findMany({
    where: { appUserId },
    select: { id: true },
  });
  const accountIds = accounts.map((account) => account.id);
  if (!accountIds.length) return emptyGeneralAnalytics();

  const raw = await loadRawAnalyticsInput(appUserId, accountIds, prisma);
  const rawMetrics = buildAnalyticsMetrics(raw);
  if (rawMetrics.dailyRollups.length || rawMetrics.fills.length || rawMetrics.positions.length) return analyticsDataFromMetrics(rawMetrics);

  const [persistedRollups, persistedFillMetrics, persistedPositionMetrics] = await Promise.all([
    prisma.analyticsDailyRollup.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { date: "asc" },
    }),
    prisma.analyticsFillMetric.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.analyticsPositionMetric.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { metricDate: "desc" },
    }),
  ]);

  if (persistedFillMetrics.length || persistedRollups.length || persistedPositionMetrics.length) {
    return analyticsDataFromMetrics({
      dailyRollups: persistedRollups.map((row) => ({
        date: row.date,
        equityCents: row.equityCents,
        cashBalanceCents: row.cashBalanceCents,
        portfolioValueCents: row.portfolioValueCents,
        realizedPnlCents: row.realizedPnlCents,
        unrealizedPnlCents: row.unrealizedPnlCents,
        totalPnlCents: row.totalPnlCents,
        grossPnlCents: row.grossPnlCents,
        feesCents: row.feesCents,
        exposureCents: row.exposureCents,
        drawdownCents: row.drawdownCents,
        costBasisCents: row.costBasisCents,
        fillCount: row.fillCount,
        orderCount: row.orderCount,
        settlementCount: row.settlementCount,
      })),
      fills: persistedFillMetrics.map((row) => ({
        fillId: row.fillId,
        orderId: row.orderId,
        marketTicker: row.marketTicker,
        eventTicker: row.eventTicker,
        category: row.category ?? "Uncategorized",
        tags: row.tags,
        side: row.side,
        action: row.action,
        entryPriceCents: row.entryPriceCents,
        priceBucket: row.priceBucket,
        contractCount: Number(row.contractCount),
        costCents: row.costCents,
        feeCents: row.feeCents,
        createdTime: row.createdAt,
        closeTime: null,
        clv1hCents: row.clv1hCents,
        clv24hCents: row.clv24hCents,
        clvCloseCents: row.clvCloseCents,
        brierScore: row.brierScore == null ? null : Number(row.brierScore),
        settled: row.settled,
        won: row.won,
        realizedPnlCents: row.realizedPnlCents,
        orderCreatedAt: row.orderCreatedAt,
        timeToFillSeconds: row.timeToFillSeconds,
        nearestOrderbookObservedAt: row.nearestOrderbookObservedAt,
        midpointCents: row.midpointCents,
        spreadCents: row.spreadCents,
        slippageCents: row.slippageCents,
      })),
      positions: latestPositionMetrics(persistedPositionMetrics).map((row) => ({
        marketTicker: row.marketTicker,
        eventTicker: row.eventTicker,
        category: row.category ?? "Uncategorized",
        side: row.side,
        positionContracts: Number(row.positionContracts),
        exposureCents: row.exposureCents,
        unrealizedPnlCents: row.unrealizedPnlCents,
        realizedPnlCents: row.realizedPnlCents,
        worstCaseLossCents: row.worstCaseLossCents,
        closeDate: row.closeDate,
        concentrationWeight: row.concentrationWeight == null ? null : Number(row.concentrationWeight),
      })),
    });
  }

  return emptyGeneralAnalytics();
}

export function priceBucketForCents(priceCents: number) {
  if (priceCents < 25) return "0-25c";
  if (priceCents < 45) return "25-45c";
  if (priceCents <= 55) return "45-55c";
  if (priceCents <= 75) return "55-75c";
  return "75-100c";
}

export function chosenSidePriceCents(side: OutcomeSide | "yes" | "no" | "unknown", yesPriceCents: number | null | undefined) {
  if (yesPriceCents == null) return null;
  if (side === "no") return clampCents(100 - yesPriceCents);
  if (side === "yes") return clampCents(yesPriceCents);
  return null;
}

export function clvCents(side: OutcomeSide | "yes" | "no" | "unknown", entryPriceCents: number, laterYesPriceCents: number | null | undefined) {
  const laterChosen = chosenSidePriceCents(side, laterYesPriceCents);
  return laterChosen == null ? null : laterChosen - entryPriceCents;
}

export function brierScore(entryPriceCents: number, won: boolean) {
  const probability = entryPriceCents / 100;
  const outcome = won ? 1 : 0;
  return Math.pow(probability - outcome, 2);
}

export function drawdownSeries(values: Array<{ date: Date; valueCents: number }>) {
  let peak = Number.NEGATIVE_INFINITY;
  return values.map((point) => {
    peak = Math.max(peak, point.valueCents);
    return {
      date: point.date,
      drawdownCents: point.valueCents - peak,
    };
  });
}

async function loadRawAnalyticsInput(appUserId: string, accountIds: string[], prisma: ReturnType<typeof getPrisma>) {
  const [fills, orders, positions, eventPositions, settlements, balances, notes, candles, orderbookSnapshots] = await Promise.all([
    prisma.fill.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { market: { include: { event: true } } },
      orderBy: { createdTime: "asc" },
    }),
    prisma.order.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { createdTime: "asc" },
    }),
    prisma.position.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { market: { include: { event: true } } },
    }),
    prisma.eventPosition.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { event: true },
    }),
    prisma.settlement.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { market: { include: { event: true } } },
      orderBy: { settledTime: "asc" },
    }),
    prisma.balanceSnapshot.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.betNote.findMany({
      where: { appUserId },
      select: { marketTicker: true, fillId: true, tags: true },
    }),
    prisma.marketCandlestick.findMany({
      where: { marketTicker: { in: [] } },
    }),
    prisma.orderbookSnapshot.findMany({
      where: { marketTicker: { in: [] } },
    }),
  ]);
  const tickers = Array.from(new Set(fills.map((fill) => fill.marketTicker).concat(positions.map((position) => position.marketTicker))));
  const [relevantCandles, relevantOrderbooks] = await Promise.all([
    tickers.length
      ? prisma.marketCandlestick.findMany({
          where: { marketTicker: { in: tickers }, periodIntervalMinutes: CANDLE_PERIOD_MINUTES },
          orderBy: { endPeriod: "asc" },
        })
      : Promise.resolve(candles),
    tickers.length
      ? prisma.orderbookSnapshot.findMany({
          where: { marketTicker: { in: tickers } },
          orderBy: { observedAt: "asc" },
        })
      : Promise.resolve(orderbookSnapshots),
  ]);

  return {
    fills,
    orders,
    positions,
    eventPositions,
    settlements,
    balances,
    notes,
    candles: relevantCandles,
    orderbookSnapshots: relevantOrderbooks,
  };
}

function buildAnalyticsMetrics(input: {
  fills: FillInput[];
  orders: OrderInput[];
  positions: PositionInput[];
  eventPositions: EventPositionInput[];
  settlements: SettlementInput[];
  balances: BalanceInput[];
  notes: NoteInput[];
  candles: CandleInput[];
  orderbookSnapshots: OrderbookInput[];
}) {
  const candlesByTicker = groupBy(input.candles, (candle) => candle.marketTicker);
  const orderbooksByTicker = groupBy(input.orderbookSnapshots, (snapshot) => snapshot.marketTicker);
  const ordersById = new Map(input.orders.map((order) => [order.orderId, order]));
  const tagsByMarket = new Map<string, string[]>();
  const tagsByFill = new Map<string, string[]>();
  for (const note of input.notes) {
    if (note.marketTicker) tagsByMarket.set(note.marketTicker, uniqueStrings([...(tagsByMarket.get(note.marketTicker) ?? []), ...note.tags]));
    if (note.fillId) tagsByFill.set(note.fillId, uniqueStrings([...(tagsByFill.get(note.fillId) ?? []), ...note.tags]));
  }
  const settlementPnlByMarket = mapSettlementPnlByMarket(input.settlements);
  const settlementByMarket = new Map(input.settlements.map((settlement) => [settlement.marketTicker, settlement]));
  const fillCostByMarket = mapFillCostByMarket(input.fills);

  const fillMetrics = input.fills.map((fill) => {
    const category = categoryForMarket(fill.market);
    const closeTime = marketCloseTime(fill.market);
    const order = fill.orderId ? ordersById.get(fill.orderId) : null;
    const costCents = fillCostCents(fill);
    const settlement = settlementByMarket.get(fill.marketTicker);
    const settled = Boolean(settlement?.realizedPnlCents != null);
    const marketPnl = settlementPnlByMarket.get(fill.marketTicker) ?? 0;
    const marketCost = fillCostByMarket.get(fill.marketTicker) ?? 0;
    const realizedPnlCents = settled && marketCost > 0 ? Math.round((marketPnl * costCents) / marketCost) : null;
    const won = settled ? marketPnl > 0 : null;
    const candles = candlesByTicker.get(fill.marketTicker) ?? [];
    const orderbook = nearestSnapshot(fill.createdTime, orderbooksByTicker.get(fill.marketTicker) ?? []);
    const midpoint = chosenSidePriceCents(fill.outcomeSide, orderbook?.midpointCents ?? null);
    const slippageCents = midpoint == null ? null : fill.action?.toLowerCase() === "sell" ? midpoint - fill.priceCents : fill.priceCents - midpoint;
    const orderCreatedAt = order?.createdTime ?? null;
    const timeToFillSeconds = orderCreatedAt ? Math.max(0, Math.round((fill.createdTime.getTime() - orderCreatedAt.getTime()) / 1000)) : null;

    return {
      fillId: fill.fillId,
      orderId: fill.orderId,
      marketTicker: fill.marketTicker,
      eventTicker: fill.eventTicker ?? fill.market.eventTicker ?? null,
      category,
      tags: uniqueStrings([...(tagsByFill.get(fill.fillId) ?? []), ...(tagsByMarket.get(fill.marketTicker) ?? [])]),
      side: fill.outcomeSide,
      action: fill.action,
      entryPriceCents: fill.priceCents,
      priceBucket: priceBucketForCents(fill.priceCents),
      contractCount: Number(fill.contractCount),
      costCents,
      feeCents: fill.feeCents,
      createdTime: fill.createdTime,
      closeTime,
      clv1hCents: clvAt(fill, candles, new Date(fill.createdTime.getTime() + 60 * ONE_MINUTE_MS)),
      clv24hCents: clvAt(fill, candles, new Date(fill.createdTime.getTime() + 24 * 60 * ONE_MINUTE_MS)),
      clvCloseCents: closeTime ? clvAt(fill, candles, closeTime) : null,
      brierScore: won == null ? null : brierScore(fill.priceCents, won),
      settled,
      won,
      realizedPnlCents,
      orderCreatedAt,
      timeToFillSeconds,
      nearestOrderbookObservedAt: orderbook?.observedAt ?? null,
      midpointCents: midpoint,
      spreadCents: orderbook?.spreadCents ?? null,
      slippageCents,
    } satisfies ClassifiedFill;
  });
  const positionMetrics = buildPositionMetrics(input.positions, input.eventPositions);
  const dailyRollups = buildDailyRollups(input.balances, input.fills, input.orders, input.settlements, positionMetrics);

  return {
    dailyRollups,
    fills: fillMetrics,
    positions: positionMetrics,
    orderStats: buildOrderStats(input.orders),
  };
}

async function persistAnalyticsMetrics(
  prisma: ReturnType<typeof getPrisma>,
  kalshiAccountId: string,
  metrics: { dailyRollups: DailyRollup[]; fills: ClassifiedFill[]; positions: PositionMetric[] },
) {
  await prisma.$transaction([
    prisma.analyticsDailyRollup.deleteMany({ where: { kalshiAccountId } }),
    prisma.analyticsFillMetric.deleteMany({ where: { kalshiAccountId } }),
    prisma.analyticsPositionMetric.deleteMany({ where: { kalshiAccountId } }),
  ]);
  if (metrics.dailyRollups.length) {
    await prisma.analyticsDailyRollup.createMany({
      data: metrics.dailyRollups.map((rollup) => ({
        kalshiAccountId,
        date: rollup.date,
        equityCents: rollup.equityCents,
        cashBalanceCents: rollup.cashBalanceCents,
        portfolioValueCents: rollup.portfolioValueCents,
        realizedPnlCents: rollup.realizedPnlCents,
        unrealizedPnlCents: rollup.unrealizedPnlCents,
        totalPnlCents: rollup.totalPnlCents,
        grossPnlCents: rollup.grossPnlCents,
        feesCents: rollup.feesCents,
        exposureCents: rollup.exposureCents,
        drawdownCents: rollup.drawdownCents,
        costBasisCents: rollup.costBasisCents,
        fillCount: rollup.fillCount,
        orderCount: rollup.orderCount,
        settlementCount: rollup.settlementCount,
        rawJson: {} as Prisma.InputJsonValue,
      })),
    });
  }
  if (metrics.fills.length) {
    await prisma.analyticsFillMetric.createMany({
      data: metrics.fills.map((fill) => ({
        kalshiAccountId,
        fillId: fill.fillId,
        orderId: fill.orderId,
        marketTicker: fill.marketTicker,
        eventTicker: fill.eventTicker,
        category: fill.category,
        tags: fill.tags,
        side: fill.side,
        action: fill.action,
        entryPriceCents: fill.entryPriceCents,
        priceBucket: fill.priceBucket,
        contractCount: fill.contractCount.toString(),
        costCents: fill.costCents,
        feeCents: fill.feeCents,
        clv1hCents: fill.clv1hCents,
        clv24hCents: fill.clv24hCents,
        clvCloseCents: fill.clvCloseCents,
        brierScore: fill.brierScore == null ? null : fill.brierScore.toFixed(8),
        settled: fill.settled,
        won: fill.won,
        realizedPnlCents: fill.realizedPnlCents,
        orderCreatedAt: fill.orderCreatedAt,
        timeToFillSeconds: fill.timeToFillSeconds,
        nearestOrderbookObservedAt: fill.nearestOrderbookObservedAt,
        midpointCents: fill.midpointCents,
        spreadCents: fill.spreadCents,
        slippageCents: fill.slippageCents,
        rawJson: {} as Prisma.InputJsonValue,
      })),
    });
  }
  if (metrics.positions.length) {
    const metricDate = new Date();
    await prisma.analyticsPositionMetric.createMany({
      data: metrics.positions.map((position) => ({
        kalshiAccountId,
        metricDate,
        marketTicker: position.marketTicker,
        eventTicker: position.eventTicker,
        category: position.category,
        side: position.side,
        positionContracts: position.positionContracts.toString(),
        exposureCents: position.exposureCents,
        unrealizedPnlCents: position.unrealizedPnlCents,
        realizedPnlCents: position.realizedPnlCents,
        worstCaseLossCents: position.worstCaseLossCents,
        closeDate: position.closeDate,
        concentrationWeight: position.concentrationWeight == null ? null : position.concentrationWeight.toFixed(8),
        rawJson: {} as Prisma.InputJsonValue,
      })),
    });
  }
}

function analyticsDataFromMetrics(metrics: { dailyRollups: DailyRollup[]; fills: ClassifiedFill[]; positions: PositionMetric[]; orderStats?: OrderStats }): GeneralAnalyticsData {
  if (!metrics.dailyRollups.length && !metrics.fills.length && !metrics.positions.length) return emptyGeneralAnalytics();

  const latest = metrics.dailyRollups[metrics.dailyRollups.length - 1] ?? null;
  const settledFills = metrics.fills.filter((fill) => fill.settled);
  const realizedPnlCents = metrics.fills.reduce((sum, fill) => sum + (fill.realizedPnlCents ?? 0), 0);
  const feeDragCents = metrics.fills.reduce((sum, fill) => sum + fill.feeCents, 0);
  const unrealizedPnlCents = metrics.positions.reduce((sum, position) => sum + position.unrealizedPnlCents, 0);
  const totalPnlCents = realizedPnlCents + unrealizedPnlCents;
  const costBasisCents = settledFills.reduce((sum, fill) => sum + fill.costCents, 0);
  const maxDrawdownCents = metrics.dailyRollups.length ? Math.min(...metrics.dailyRollups.map((rollup) => rollup.drawdownCents)) : null;
  const executionStats = buildExecutionStats(metrics.fills, metrics.orderStats);
  const concentration = concentrationForPositions(metrics.positions);

  return {
    hasData: true,
    kpis: {
      totalPnlCents,
      realizedPnlCents,
      unrealizedPnlCents,
      roi: costBasisCents === 0 ? null : realizedPnlCents / costBasisCents,
      maxDrawdownCents,
      feeDragCents,
    },
    performance: {
      equity: metrics.dailyRollups.map((rollup) => ({
        date: rollup.date.toISOString(),
        portfolioValueCents: rollup.equityCents,
        realizedPnlCents: rollup.realizedPnlCents,
        unrealizedPnlCents: rollup.unrealizedPnlCents,
        depositsAdjustedEquityCents: null,
      })),
      drawdown: metrics.dailyRollups.map((rollup) => ({
        date: rollup.date.toISOString(),
        drawdownCents: rollup.drawdownCents,
      })),
      waterfall: [
        { label: "Gross P/L", valueCents: (latest?.grossPnlCents ?? realizedPnlCents) },
        { label: "Fees", valueCents: -Math.abs(feeDragCents) },
        { label: "Net P/L", valueCents: realizedPnlCents },
      ],
    },
    edge: {
      calibration: buildCalibration(metrics.fills),
      brierOverTime: buildBrierOverTime(metrics.fills),
      clv: [
        { label: "1h", averageClvCents: average(metrics.fills.map((fill) => fill.clv1hCents)), fills: countPresent(metrics.fills.map((fill) => fill.clv1hCents)) },
        { label: "24h", averageClvCents: average(metrics.fills.map((fill) => fill.clv24hCents)), fills: countPresent(metrics.fills.map((fill) => fill.clv24hCents)) },
        { label: "Close", averageClvCents: average(metrics.fills.map((fill) => fill.clvCloseCents)), fills: countPresent(metrics.fills.map((fill) => fill.clvCloseCents)) },
      ],
      roiByBucketSide: buildRoiByBucketSide(metrics.fills),
    },
    risk: {
      exposureHeatmap: metrics.positions.map((position) => ({
        category: position.category,
        event: position.eventTicker ?? position.marketTicker,
        closeDate: position.closeDate?.toISOString() ?? null,
        side: position.side,
        exposureCents: position.exposureCents,
      })),
      settlementCalendar: buildSettlementCalendar(metrics.positions),
      worstCase: {
        lossCents: metrics.positions.reduce((sum, position) => sum + position.worstCaseLossCents, 0),
        openMarkets: metrics.positions.length,
        largestEventCents: largestGroupValue(metrics.positions, (position) => position.eventTicker ?? position.marketTicker),
      },
      concentration,
    },
    execution: {
      fillQuality: metrics.fills
        .slice()
        .sort((left, right) => right.createdTime.getTime() - left.createdTime.getTime())
        .slice(0, 40)
        .map((fill) => ({
          fillId: fill.fillId,
          marketTicker: fill.marketTicker,
          category: fill.category,
          side: fill.side,
          entryPriceCents: fill.entryPriceCents,
          midpointCents: fill.midpointCents,
          spreadCents: fill.spreadCents,
          slippageCents: fill.slippageCents,
          feeCents: fill.feeCents,
          timeToFillSeconds: fill.timeToFillSeconds,
        })),
      stats: executionStats,
      feeDragByCategory: groupCents(metrics.fills, (fill) => fill.category, (fill) => fill.feeCents),
      feeDragByTag: groupByTags(metrics.fills, (fill) => fill.feeCents),
    },
    behavior: {
      pnlByTag: groupByTags(metrics.fills, (fill) => fill.realizedPnlCents ?? 0),
      pnlByDay: groupCents(metrics.fills, (fill) => dayName(fill.createdTime), (fill) => fill.realizedPnlCents ?? 0),
      pnlByHour: Array.from({ length: 24 }, (_, hour) => ({
        hour: `${hour.toString().padStart(2, "0")}:00`,
        valueCents: metrics.fills.filter((fill) => fill.createdTime.getHours() === hour).reduce((sum, fill) => sum + (fill.realizedPnlCents ?? 0), 0),
      })),
      afterWinLoss: buildAfterWinLoss(metrics.fills),
      alerts: buildBehaviorAlerts(metrics.fills),
    },
  };
}

function buildPositionMetrics(positions: PositionInput[], eventPositions: EventPositionInput[]) {
  const totalExposure = positions.reduce((sum, position) => sum + Math.max(0, position.exposureCents ?? 0), 0);
  const coveredEvents = new Set(
    eventPositions
      .filter((position) => Number(position.totalCostShares) !== 0 || (position.eventExposureCents ?? 0) !== 0)
      .map((position) => position.eventTicker),
  );
  return positions
    .filter((position) => Number(position.positionContracts) !== 0)
    .filter((position) => !(position.eventTicker && coveredEvents.has(position.eventTicker)))
    .map((position) => {
      const exposureCents = Math.max(0, position.exposureCents ?? 0);
      return {
        marketTicker: position.marketTicker,
        eventTicker: position.eventTicker ?? position.market.eventTicker ?? null,
        category: categoryForMarket(position.market),
        side: Number(position.positionContracts) >= 0 ? "yes" : "no",
        positionContracts: Number(position.positionContracts),
        exposureCents,
        unrealizedPnlCents: position.unrealizedPnlCents ?? 0,
        realizedPnlCents: position.realizedPnlCents,
        worstCaseLossCents: exposureCents,
        closeDate: marketCloseTime(position.market),
        concentrationWeight: totalExposure === 0 ? null : exposureCents / totalExposure,
      } satisfies PositionMetric;
    });
}

function buildDailyRollups(
  balances: BalanceInput[],
  fills: FillInput[],
  orders: OrderInput[],
  settlements: SettlementInput[],
  positionMetrics: PositionMetric[],
) {
  const dailyBalances = dedupeBy(
    balances.map((balance) => ({
      date: startOfDay(balance.capturedAt),
      cashBalanceCents: balance.cashBalanceCents ?? 0,
      portfolioValueCents: balance.portfolioValueCents ?? 0,
      equityCents: (balance.cashBalanceCents ?? 0) + (balance.portfolioValueCents ?? 0),
    })),
    (balance) => balance.date.toISOString(),
  );
  const series = drawdownSeries(dailyBalances.map((balance) => ({ date: balance.date, valueCents: balance.equityCents })));
  const drawdownByDate = new Map(series.map((point) => [point.date.toISOString(), point.drawdownCents]));
  const currentExposure = positionMetrics.reduce((sum, position) => sum + position.exposureCents, 0);
  const currentUnrealized = positionMetrics.reduce((sum, position) => sum + position.unrealizedPnlCents, 0);

  return dailyBalances.map((balance) => {
    const realizedPnlCents = settlements
      .filter((settlement) => settlement.settledTime && startOfDay(settlement.settledTime) <= balance.date)
      .reduce((sum, settlement) => sum + (settlement.realizedPnlCents ?? 0), 0);
    const feesCents = fills.filter((fill) => startOfDay(fill.createdTime) <= balance.date).reduce((sum, fill) => sum + fill.feeCents, 0);
    const costBasisCents = fills.filter((fill) => startOfDay(fill.createdTime) <= balance.date).reduce((sum, fill) => sum + fillCostCents(fill), 0);
    return {
      date: balance.date,
      equityCents: balance.equityCents,
      cashBalanceCents: balance.cashBalanceCents,
      portfolioValueCents: balance.portfolioValueCents,
      realizedPnlCents,
      unrealizedPnlCents: currentUnrealized,
      totalPnlCents: realizedPnlCents + currentUnrealized,
      grossPnlCents: realizedPnlCents + feesCents,
      feesCents,
      exposureCents: currentExposure,
      drawdownCents: drawdownByDate.get(balance.date.toISOString()) ?? 0,
      costBasisCents,
      fillCount: fills.filter((fill) => startOfDay(fill.createdTime).getTime() === balance.date.getTime()).length,
      orderCount: orders.filter((order) => order.createdTime && startOfDay(order.createdTime).getTime() === balance.date.getTime()).length,
      settlementCount: settlements.filter((settlement) => settlement.settledTime && startOfDay(settlement.settledTime).getTime() === balance.date.getTime()).length,
    } satisfies DailyRollup;
  });
}

async function importTargetedCandlesticks(prisma: ReturnType<typeof getPrisma>, client: KalshiRestClient, fills: FillInput[], warnings: string[]) {
  const created: Prisma.MarketCandlestickCreateManyInput[] = [];
  let rangeCount = 0;
  const rangesByTicker = new Map<string, Array<{ startTs: number; endTs: number }>>();

  for (const fill of fills) {
    const targets = [new Date(fill.createdTime.getTime() + 60 * ONE_MINUTE_MS), new Date(fill.createdTime.getTime() + 24 * 60 * ONE_MINUTE_MS)];
    const close = marketCloseTime(fill.market);
    if (close) targets.push(close);
    for (const target of targets) {
      if (target.getTime() > Date.now()) continue;
      const ranges = rangesByTicker.get(fill.marketTicker) ?? [];
      ranges.push({
        startTs: Math.max(0, Math.floor(target.getTime() / 1000) - CANDLE_PADDING_SECONDS),
        endTs: Math.floor(target.getTime() / 1000) + CANDLE_PADDING_SECONDS,
      });
      rangesByTicker.set(fill.marketTicker, ranges);
    }
  }

  for (const [ticker, ranges] of rangesByTicker) {
    for (const range of mergeRanges(ranges)) {
      if (rangeCount >= MAX_CANDLE_RANGES_PER_SYNC) {
        pushWarningOnce(warnings, `general analytics: skipped candle ranges after ${MAX_CANDLE_RANGES_PER_SYNC} targeted windows`);
        break;
      }
      rangeCount += 1;
      created.push(...(await fetchCandlesticks(client, ticker, range.startTs, range.endTs, warnings)));
    }
  }

  const deduped = dedupeBy(created, (candle) => `${candle.marketTicker}:${candle.periodIntervalMinutes}:${new Date(candle.endPeriod).toISOString()}`);
  if (deduped.length) await prisma.marketCandlestick.createMany({ data: deduped, skipDuplicates: true });
  return deduped.length;
}

async function fetchCandlesticks(client: KalshiRestClient, ticker: string, startTs: number, endTs: number, warnings: string[]) {
  try {
    const live = await client.getMarketCandlesticks({
      market_tickers: ticker,
      start_ts: startTs,
      end_ts: endTs,
      period_interval: CANDLE_PERIOD_MINUTES,
      include_latest_before_start: true,
    });
    const liveCandles = normalizeBatchCandlesticks(live);
    if (liveCandles.length) return liveCandles;
  } catch (error) {
    if (!/Kalshi API 404/.test(error instanceof Error ? error.message : String(error))) {
      pushWarningOnce(warnings, `general candles ${ticker}: ${shortError(error)}`);
    }
  }

  try {
    const historical = await client.getHistoricalMarketCandlesticks(ticker, {
      start_ts: startTs,
      end_ts: endTs,
      period_interval: CANDLE_PERIOD_MINUTES,
    });
    return normalizeSingleMarketCandlesticks(historical, ticker);
  } catch (error) {
    pushWarningOnce(warnings, `general historical candles ${ticker}: ${shortError(error)}`);
    return [];
  }
}

async function importOpenOrderbooks(
  prisma: ReturnType<typeof getPrisma>,
  client: KalshiRestClient,
  positions: PositionInput[],
  eventPositions: EventPositionInput[],
  warnings: string[],
) {
  const coveredEvents = new Set(
    eventPositions
      .filter((position) => Number(position.totalCostShares) !== 0 || (position.eventExposureCents ?? 0) !== 0)
      .map((position) => position.eventTicker),
  );
  const tickers = positions
    .filter((position) => Number(position.positionContracts) !== 0)
    .filter((position) => !(position.eventTicker && coveredEvents.has(position.eventTicker)))
    .map((position) => position.marketTicker);
  if (!tickers.length) return 0;

  const observedAt = new Date();
  const rows: Prisma.OrderbookSnapshotCreateManyInput[] = [];
  for (const chunk of chunks(Array.from(new Set(tickers)), 100)) {
    try {
      const result = await client.getMultipleMarketOrderbooks(chunk);
      rows.push(...normalizeOrderbooks(result, observedAt));
    } catch (error) {
      pushWarningOnce(warnings, `general orderbooks: ${shortError(error)}`);
    }
  }
  if (rows.length) await prisma.orderbookSnapshot.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

function buildCalibration(fills: ClassifiedFill[]) {
  return bucketOrder().map((bucket) => {
    const settled = fills.filter((fill) => fill.priceBucket === bucket && fill.won != null);
    return {
      bucket,
      impliedProbability: settled.length ? settled.reduce((sum, fill) => sum + fill.entryPriceCents / 100, 0) / settled.length : bucketImpliedProbability(bucket),
      actualWinRate: settled.length ? settled.filter((fill) => fill.won).length / settled.length : null,
      fills: settled.length,
    };
  });
}

function buildBrierOverTime(fills: ClassifiedFill[]) {
  return groupDaily(fills.filter((fill) => fill.brierScore != null), (fill) => fill.createdTime).map(([date, rows]) => ({
    date,
    brierScore: average(rows.map((row) => row.brierScore)) ?? 0,
  }));
}

function buildRoiByBucketSide(fills: ClassifiedFill[]) {
  const rows: GeneralAnalyticsData["edge"]["roiByBucketSide"] = [];
  for (const bucket of bucketOrder()) {
    for (const side of ["yes", "no", "unknown"] as const) {
      const scoped = fills.filter((fill) => fill.priceBucket === bucket && fill.side === side);
      const cost = scoped.reduce((sum, fill) => sum + fill.costCents, 0);
      const pnl = scoped.reduce((sum, fill) => sum + (fill.realizedPnlCents ?? 0), 0);
      if (scoped.length) rows.push({ bucket, side, fills: scoped.length, roi: cost === 0 ? null : pnl / cost, realizedPnlCents: pnl });
    }
  }
  return rows;
}

function buildSettlementCalendar(positions: PositionMetric[]) {
  const rows = new Map<string, { exposureCents: number; settlementCount: number }>();
  for (const position of positions) {
    if (!position.closeDate) continue;
    const date = position.closeDate.toISOString().slice(0, 10);
    const current = rows.get(date) ?? { exposureCents: 0, settlementCount: 0 };
    current.exposureCents += position.exposureCents;
    current.settlementCount += 1;
    rows.set(date, current);
  }
  return Array.from(rows.entries())
    .map(([date, row]) => ({ date, ...row }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildOrderStats(orders: OrderInput[]): OrderStats {
  const total = orders.length;
  if (!total) return { fillRate: null, cancelRate: null, partialFillRate: null };
  const filled = orders.filter((order) => Number(order.filledCount) > 0 || order.status === "executed").length;
  const canceled = orders.filter((order) => order.status === "canceled").length;
  const partial = orders.filter((order) => Number(order.filledCount) > 0 && Number(order.remainingCount) > 0).length;
  return {
    fillRate: filled / total,
    cancelRate: canceled / total,
    partialFillRate: partial / total,
  };
}

function buildExecutionStats(fills: ClassifiedFill[], orderStats?: OrderStats) {
  return {
    fillRate: orderStats?.fillRate ?? null,
    cancelRate: orderStats?.cancelRate ?? null,
    partialFillRate: orderStats?.partialFillRate ?? null,
    averageTimeToFillSeconds: average(fills.map((fill) => fill.timeToFillSeconds)),
    averageSlippageCents: average(fills.map((fill) => fill.slippageCents)),
  };
}

function buildAfterWinLoss(fills: ClassifiedFill[]) {
  const settled = fills.filter((fill) => fill.won != null).sort((left, right) => left.createdTime.getTime() - right.createdTime.getTime());
  const buckets = new Map<string, { fills: number; averageCostCents: number; realizedPnlCents: number; costSum: number }>([
    ["After wins", { fills: 0, averageCostCents: 0, realizedPnlCents: 0, costSum: 0 }],
    ["After losses", { fills: 0, averageCostCents: 0, realizedPnlCents: 0, costSum: 0 }],
  ]);
  for (let index = 1; index < settled.length; index += 1) {
    const previous = settled[index - 1];
    const current = settled[index];
    const key = previous.won ? "After wins" : "After losses";
    const bucket = buckets.get(key)!;
    bucket.fills += 1;
    bucket.costSum += current.costCents;
    bucket.realizedPnlCents += current.realizedPnlCents ?? 0;
  }
  return Array.from(buckets.entries()).map(([label, bucket]) => ({
    label,
    fills: bucket.fills,
    averageCostCents: bucket.fills ? Math.round(bucket.costSum / bucket.fills) : 0,
    realizedPnlCents: bucket.realizedPnlCents,
  }));
}

function buildBehaviorAlerts(fills: ClassifiedFill[]): GeneralAnalyticsData["behavior"]["alerts"] {
  const alerts: GeneralAnalyticsData["behavior"]["alerts"] = [];
  const after = buildAfterWinLoss(fills);
  const afterWins = after.find((row) => row.label === "After wins");
  const afterLosses = after.find((row) => row.label === "After losses");
  const avgFee = average(fills.map((fill) => fill.feeCents)) ?? 0;
  const lossFollowFills = fills.filter((fill, index) => index > 0 && fills[index - 1]?.won === false);
  const lossFollowFee = average(lossFollowFills.map((fill) => fill.feeCents)) ?? 0;

  if (afterLosses && afterWins && afterLosses.fills >= 3 && afterLosses.averageCostCents > afterWins.averageCostCents * 1.25) {
    alerts.push({
      id: "tilt-size",
      title: "Tilt detector: increased size after losses",
      detail: "Average entry cost after losses is at least 25% higher than after wins.",
      tone: "negative",
    });
  }
  if (lossFollowFills.length >= 3 && lossFollowFee > avgFee * 1.25) {
    alerts.push({
      id: "tilt-fees",
      title: "Tilt detector: higher fee churn after losses",
      detail: "Trades following losses are producing elevated fee drag.",
      tone: "negative",
    });
  }
  if (!alerts.length) {
    alerts.push({
      id: "no-behavior-alerts",
      title: "No behavior alerts",
      detail: "No general strategy or tilt warning has enough real data to trigger.",
      tone: "neutral",
    });
  }
  return alerts;
}

function concentrationForPositions(positions: PositionMetric[]) {
  const total = positions.reduce((sum, position) => sum + position.exposureCents, 0);
  if (total <= 0) return { score: null, level: "unknown" as const, label: "No open exposure" };
  const score = positions.reduce((sum, position) => sum + Math.pow(position.exposureCents / total, 2), 0);
  const level: "green" | "yellow" | "red" = score < 0.18 ? "green" : score < 0.35 ? "yellow" : "red";
  return {
    score,
    level,
    label: level === "green" ? "Diversified" : level === "yellow" ? "Moderate concentration" : "High concentration",
  };
}

function normalizeBatchCandlesticks(value: unknown) {
  const rows: Prisma.MarketCandlestickCreateManyInput[] = [];
  for (const market of arrayFrom(asRecord(value), "markets")) {
    const marketRecord = asRecord(market);
    const ticker = text(marketRecord, ["market_ticker", "ticker"]);
    if (!ticker) continue;
    for (const candle of arrayFrom(marketRecord, "candlesticks")) {
      const normalized = normalizeCandlestick(ticker, candle);
      if (normalized) rows.push(normalized);
    }
  }
  return rows;
}

function normalizeSingleMarketCandlesticks(value: unknown, fallbackTicker: string) {
  const record = asRecord(value);
  const ticker = text(record, ["market_ticker", "ticker"]) ?? fallbackTicker;
  return arrayFrom(record, "candlesticks")
    .map((candle) => normalizeCandlestick(ticker, candle))
    .filter((candle): candle is Prisma.MarketCandlestickCreateManyInput => Boolean(candle));
}

function normalizeCandlestick(ticker: string, rawCandle: unknown): Prisma.MarketCandlestickCreateManyInput | null {
  const candle = asRecord(rawCandle);
  const endTs = numberValue(candle.end_period_ts);
  if (!endTs) return null;
  return {
    marketTicker: ticker,
    periodIntervalMinutes: CANDLE_PERIOD_MINUTES,
    endPeriod: new Date(endTs * 1000),
    yesBidCloseCents: nestedCents(candle, "yes_bid", ["close_dollars", "close"]),
    yesAskCloseCents: nestedCents(candle, "yes_ask", ["close_dollars", "close"]),
    priceCloseCents: nestedCents(candle, "price", ["close_dollars", "close"]),
    priceMeanCents: nestedCents(candle, "price", ["mean_dollars", "mean"]),
    rawJson: candle as Prisma.InputJsonValue,
  };
}

function normalizeOrderbooks(value: unknown, observedAt: Date) {
  return arrayFrom(asRecord(value), "orderbooks")
    .map((rawOrderbook) => normalizeOrderbook(rawOrderbook, observedAt))
    .filter((row): row is Prisma.OrderbookSnapshotCreateManyInput => Boolean(row));
}

function normalizeOrderbook(rawOrderbook: unknown, observedAt: Date): Prisma.OrderbookSnapshotCreateManyInput | null {
  const row = asRecord(rawOrderbook);
  const ticker = text(row, ["ticker", "market_ticker"]);
  if (!ticker) return null;
  const orderbook = asRecord(row.orderbook_fp ?? row.orderbook ?? row);
  const yesBidCents = bestBidCents(orderbook.yes_dollars ?? orderbook.yes);
  const noBidCents = bestBidCents(orderbook.no_dollars ?? orderbook.no);
  const yesAskCents = noBidCents == null ? null : clampCents(100 - noBidCents);
  const noAskCents = yesBidCents == null ? null : clampCents(100 - yesBidCents);
  const spreadCents = yesBidCents == null || yesAskCents == null ? null : Math.max(0, yesAskCents - yesBidCents);
  const midpointCents = yesBidCents == null || yesAskCents == null ? null : Math.round((yesBidCents + yesAskCents) / 2);
  return {
    marketTicker: ticker,
    observedAt,
    yesBidCents,
    yesAskCents,
    noBidCents,
    noAskCents,
    spreadCents,
    midpointCents,
    rawJson: row as Prisma.InputJsonValue,
  };
}

function clvAt(fill: FillInput, candles: CandleInput[], target: Date) {
  const candle = nearestCandle(target, candles);
  return clvCents(fill.outcomeSide, fill.priceCents, candle?.priceCloseCents);
}

function nearestCandle(target: Date, candles: CandleInput[]) {
  let best: CandleInput | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candle of candles) {
    const distance = Math.abs(candle.endPeriod.getTime() - target.getTime());
    if (distance < bestDistance) {
      best = candle;
      bestDistance = distance;
    }
  }
  return bestDistance <= 5 * ONE_MINUTE_MS ? best : null;
}

function nearestSnapshot(target: Date, snapshots: OrderbookInput[]) {
  let best: OrderbookInput | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const snapshot of snapshots) {
    const distance = Math.abs(snapshot.observedAt.getTime() - target.getTime());
    if (distance < bestDistance) {
      best = snapshot;
      bestDistance = distance;
    }
  }
  return bestDistance <= ORDERBOOK_SNAPSHOT_DISTANCE_MS ? best : null;
}

function fillCostCents(fill: { contractCount: unknown; priceCents: number }) {
  return Math.round(Number(fill.contractCount) * fill.priceCents);
}

function mapSettlementPnlByMarket(settlements: SettlementInput[]) {
  const map = new Map<string, number>();
  for (const settlement of settlements) {
    map.set(settlement.marketTicker, (map.get(settlement.marketTicker) ?? 0) + (settlement.realizedPnlCents ?? 0));
  }
  return map;
}

function mapFillCostByMarket(fills: FillInput[]) {
  const map = new Map<string, number>();
  for (const fill of fills) {
    map.set(fill.marketTicker, (map.get(fill.marketTicker) ?? 0) + fillCostCents(fill));
  }
  return map;
}

function categoryForMarket(market: MarketInput) {
  return market.category ?? market.event?.category ?? "Uncategorized";
}

function marketCloseTime(market: MarketInput) {
  return market.closeTime ?? market.expirationTime ?? market.settlementTime ?? null;
}

function latestPositionMetrics<T extends { metricDate: Date }>(rows: T[]) {
  const latestDate = rows.reduce<Date | null>((latest, row) => (!latest || row.metricDate > latest ? row.metricDate : latest), null);
  return latestDate ? rows.filter((row) => row.metricDate.getTime() === latestDate.getTime()) : rows;
}

function groupCents<T>(rows: T[], labelFor: (row: T) => string, valueFor: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = labelFor(row) || "Uncategorized";
    totals.set(label, (totals.get(label) ?? 0) + valueFor(row));
  }
  return Array.from(totals.entries())
    .map(([label, valueCents]) => ({ label, valueCents }))
    .sort((left, right) => Math.abs(right.valueCents) - Math.abs(left.valueCents));
}

function groupByTags(fills: ClassifiedFill[], valueFor: (fill: ClassifiedFill) => number) {
  const totals = new Map<string, number>();
  for (const fill of fills) {
    for (const tag of fill.tags.length ? fill.tags : ["Untagged"]) {
      totals.set(tag, (totals.get(tag) ?? 0) + valueFor(fill));
    }
  }
  return Array.from(totals.entries())
    .map(([label, valueCents]) => ({ label, valueCents }))
    .sort((left, right) => Math.abs(right.valueCents) - Math.abs(left.valueCents));
}

function groupDaily<T>(rows: T[], dateFor: (row: T) => Date) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const date = dateFor(row).toISOString().slice(0, 10);
    const group = map.get(date) ?? [];
    group.push(row);
    map.set(date, group);
  }
  return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function bucketOrder() {
  return ["0-25c", "25-45c", "45-55c", "55-75c", "75-100c"];
}

function bucketImpliedProbability(bucket: string) {
  if (bucket === "0-25c") return 0.125;
  if (bucket === "25-45c") return 0.35;
  if (bucket === "45-55c") return 0.5;
  if (bucket === "55-75c") return 0.65;
  return 0.875;
}

function dayName(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function largestGroupValue<T>(rows: T[], keyFor: (row: T) => string) {
  const totals = new Map<string, number>();
  for (const row of rows as Array<T & { exposureCents: number }>) {
    const key = keyFor(row);
    totals.set(key, (totals.get(key) ?? 0) + row.exposureCents);
  }
  return Math.max(0, ...Array.from(totals.values()));
}

function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function countPresent(values: Array<number | null | undefined>) {
  return values.filter((value) => value != null && Number.isFinite(value)).length;
}

function mergeRanges(ranges: Array<{ startTs: number; endTs: number }>) {
  const sorted = ranges.slice().sort((left, right) => left.startTs - right.startTs);
  const merged: Array<{ startTs: number; endTs: number }> = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.startTs <= previous.endTs + CANDLE_PADDING_SECONDS) {
      previous.endTs = Math.max(previous.endTs, range.endTs);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function nestedCents(record: JsonRecord, key: string, nestedKeys: string[]) {
  const nested = asRecord(record[key]);
  for (const nestedKey of nestedKeys) {
    const value = nested[nestedKey];
    if (value != null && value !== "") return dollarsToCents(value);
  }
  return null;
}

function bestBidCents(value: unknown) {
  if (!Array.isArray(value)) return null;
  const cents = value
    .map((level) => (Array.isArray(level) ? dollarsToCents(level[0]) : null))
    .filter((entry): entry is number => entry != null && Number.isFinite(entry));
  return cents.length ? Math.max(...cents) : null;
}

function text(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  }
  return null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function arrayFrom(record: JsonRecord, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [keyFor(item), item])).values());
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function clampCents(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shortError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

function pushWarningOnce(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function emptyGeneralAnalytics(): GeneralAnalyticsData {
  return {
    hasData: false,
    kpis: {
      totalPnlCents: null,
      realizedPnlCents: null,
      unrealizedPnlCents: null,
      roi: null,
      maxDrawdownCents: null,
      feeDragCents: null,
    },
    performance: {
      equity: [],
      drawdown: [],
      waterfall: [],
    },
    edge: {
      calibration: [],
      brierOverTime: [],
      clv: [],
      roiByBucketSide: [],
    },
    risk: {
      exposureHeatmap: [],
      settlementCalendar: [],
      worstCase: { lossCents: 0, openMarkets: 0, largestEventCents: 0 },
      concentration: { score: null, level: "unknown", label: "No open exposure" },
    },
    execution: {
      fillQuality: [],
      stats: {
        fillRate: null,
        cancelRate: null,
        partialFillRate: null,
        averageTimeToFillSeconds: null,
        averageSlippageCents: null,
      },
      feeDragByCategory: [],
      feeDragByTag: [],
    },
    behavior: {
      pnlByTag: [],
      pnlByDay: [],
      pnlByHour: [],
      afterWinLoss: [],
      alerts: [],
    },
  };
}
