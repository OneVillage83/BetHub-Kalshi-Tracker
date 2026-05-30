import { decimalToString, getPrisma } from "@kalshi-tracker/db";
import { dollarsToCents, parseFixedPoint, type KalshiRestClient } from "@kalshi-tracker/kalshi-client";
import { Prisma, type OutcomeSide, type OrderStatus } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

const ONE_MINUTE_MS = 60 * 1000;
const CLV_TARGETS = [
  { key: "clv15mCents", label: "15m", offsetMs: 15 * ONE_MINUTE_MS },
  { key: "clv1hCents", label: "1h", offsetMs: 60 * ONE_MINUTE_MS },
  { key: "clv6hCents", label: "6h", offsetMs: 6 * 60 * ONE_MINUTE_MS },
  { key: "clv24hCents", label: "24h", offsetMs: 24 * 60 * ONE_MINUTE_MS },
] as const;
const CANDLE_PERIOD_MINUTES = 1;
const CANDLE_PADDING_SECONDS = 120;
const MAX_CANDLE_RANGES_PER_SYNC = 180;
const ORDERBOOK_SNAPSHOT_DISTANCE_MS = 5 * ONE_MINUTE_MS;

type MarketForClassification = {
  ticker: string;
  eventTicker?: string | null;
  title?: string | null;
  subtitle?: string | null;
  category?: string | null;
  closeTime?: Date | null;
  expirationTime?: Date | null;
  settlementTime?: Date | null;
  rawJson?: unknown;
};

type EventForClassification = {
  ticker: string;
  title?: string | null;
  category?: string | null;
  rawJson?: unknown;
} | null;

type FillForClassification = {
  marketTicker: string;
  eventTicker?: string | null;
  rawJson?: unknown;
  market: MarketForClassification & { event: EventForClassification };
};

type SportsClassificationSource = "metadata" | "fill_raw" | "ticker_heuristic" | "heuristic";

export type SportsClassification = {
  marketTicker: string;
  eventTicker: string | null;
  eventName: string | null;
  sport: string | null;
  league: string | null;
  marketType: string | null;
  teams: string[];
  primaryTeam: string | null;
  opponentTeam: string | null;
  classificationSource: SportsClassificationSource;
  confidence: number;
  isSports: boolean;
  rawJson: JsonRecord;
};

export type SportsEnrichmentResult = {
  sportsMarkets: number;
  sportsFills: number;
  candlesticks: number;
  orderbookSnapshots: number;
  warnings: string[];
};

export type SportsAnalyticsData = {
  hasSportsData: boolean;
  kpis: {
    netPnlCents: number | null;
    roi: number | null;
    winRate: number | null;
    averageClvCents: number | null;
    openExposureCents: number | null;
    feeDragCents: number | null;
  };
  overview: {
    equity: Array<{ date: string; valueCents: number }>;
    leaguePnl: Array<{ label: string; valueCents: number }>;
    marketTypePnl: Array<{ label: string; valueCents: number }>;
    favoritePerformance: Array<{ bucket: string; fills: number; realizedPnlCents: number; roi: number | null }>;
  };
  clv: {
    distribution: Array<{ bucket: string; fills: number }>;
    calibration: Array<{ bucket: string; impliedProbability: number; actualWinRate: number | null; fills: number }>;
    entryTiming: Array<{ bucket: string; fills: number; realizedPnlCents: number; averageClvCents: number | null }>;
  };
  risk: {
    bySport: Array<{ label: string; exposureCents: number }>;
    byLeague: Array<{ label: string; exposureCents: number }>;
    byTeam: Array<{ label: string; exposureCents: number }>;
    byEvent: Array<{ eventTicker: string; eventName: string; exposureCents: number; resolvesAt: string | null }>;
    resolving: Array<{ window: string; exposureCents: number }>;
    worstCaseLossCents: number;
  };
  execution: {
    fillRate: number | null;
    cancelRate: number | null;
    partialFillRate: number | null;
    averageTimeToFillMinutes: number | null;
    averageSpreadCents: number | null;
    averageSlippageCents: number | null;
    feesCents: number;
  };
  behavior: {
    teamBias: Array<{ team: string; fills: number; realizedPnlCents: number; roi: number | null }>;
    alerts: Array<{ id: string; title: string; detail: string; tone: "positive" | "negative" | "neutral" }>;
  };
  diagnostics: {
    totalImportedFills: number;
    classifiedSportsFills: number;
    unclassifiedFillSamples: Array<{
      marketTicker: string;
      eventTicker: string | null;
      title: string | null;
      category: string | null;
      reason: string;
    }>;
    classificationWarnings: string[];
  };
};

type SportsFill = {
  id: string;
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
  rawJson: unknown;
  market: MarketForClassification & { event: EventForClassification };
};

type FillAnalyticsInput = {
  fillId: string;
  orderId: string | null;
  marketTicker: string;
  outcomeSide: OutcomeSide;
  action: string | null;
  contractCount: unknown;
  priceCents: number;
  feeCents: number;
  createdTime: Date;
};

type ClassifiedFill = FillAnalyticsInput & {
  classification: SportsClassification;
  closeTime: Date | null;
  analytics?: {
    clv15mCents: number | null;
    clv1hCents: number | null;
    clv6hCents: number | null;
    clv24hCents: number | null;
    clvCloseCents: number | null;
    spreadCents: number | null;
    slippageCents: number | null;
  } | null;
};

type SettlementInput = {
  id: string;
  marketTicker: string;
  eventTicker: string | null;
  settledTime: Date | null;
  realizedPnlCents: number | null;
  revenueCents: number | null;
  feeCents: number | null;
  market: MarketForClassification & { event: EventForClassification };
};

type PositionInput = {
  marketTicker: string;
  eventTicker: string | null;
  positionContracts: unknown;
  exposureCents: number | null;
  market: MarketForClassification & { event: EventForClassification };
};

type EventPositionInput = {
  eventTicker: string;
  totalCostShares: unknown;
  eventExposureCents: number | null;
  event: EventForClassification;
};

type OrderInput = {
  orderId: string;
  marketTicker: string;
  status: OrderStatus;
  originalCount: unknown;
  remainingCount: unknown;
  filledCount: unknown;
  createdTime: Date | null;
  updatedTime: Date | null;
};

type CandlestickRow = {
  marketTicker: string;
  periodIntervalMinutes: number;
  endPeriod: Date;
  priceCloseCents: number | null;
  rawJson: unknown;
};

type OrderbookSnapshotRow = {
  marketTicker: string;
  observedAt: Date;
  midpointCents: number | null;
  spreadCents: number | null;
};

type GroupMetric = {
  fills: number;
  costCents: number;
  realizedPnlCents: number;
  clvSum: number;
  clvCount: number;
  wins: number;
  settled: number;
  impliedSum: number;
};

type TeamAliasMatch = {
  team: string;
  league: string;
  sport: string;
  confidence: number;
};

export async function enrichSportsAnalytics(args: {
  prisma: ReturnType<typeof getPrisma>;
  client: KalshiRestClient;
  kalshiAccountId: string;
}): Promise<SportsEnrichmentResult> {
  const warnings: string[] = [];
  const [fills, positions, eventPositions] = await Promise.all([
    args.prisma.fill.findMany({
      where: { kalshiAccountId: args.kalshiAccountId },
      include: { market: { include: { event: true } } },
      orderBy: { createdTime: "asc" },
    }),
    args.prisma.position.findMany({
      where: { kalshiAccountId: args.kalshiAccountId },
      include: { market: { include: { event: true } } },
    }),
    args.prisma.eventPosition.findMany({
      where: { kalshiAccountId: args.kalshiAccountId },
      include: { event: true },
    }),
  ]);

  const classificationsByTicker = new Map<string, SportsClassification>();
  for (const fill of fills) {
    const classification = classifySportsFill(fill);
    if (classification.isSports) classificationsByTicker.set(fill.marketTicker, classification);
  }
  for (const position of positions) {
    const classification = classifySportsMarket(position.market, position.market.event);
    if (classification.isSports) classificationsByTicker.set(position.marketTicker, classification);
  }

  await upsertSportsClassifications(args.prisma, Array.from(classificationsByTicker.values()));
  const sportsFills = fills.filter((fill) => classificationsByTicker.has(fill.marketTicker));
  if (fills.length > 0 && sportsFills.length === 0) {
    pushWarningOnce(warnings, "sports analytics: imported fills exist, but none matched the sports classifier.");
  }
  const candlesticks = await importTargetedCandlesticks(args.prisma, args.client, sportsFills, classificationsByTicker, warnings);
  const orderbookSnapshots = await importOpenSportsOrderbooks(args.prisma, args.client, positions, eventPositions, classificationsByTicker, warnings);
  await upsertSportsFillAnalytics(args.prisma, args.kalshiAccountId, sportsFills, classificationsByTicker);

  return {
    sportsMarkets: classificationsByTicker.size,
    sportsFills: sportsFills.length,
    candlesticks,
    orderbookSnapshots,
    warnings,
  };
}

export async function getSportsAnalytics(appUserId: string): Promise<SportsAnalyticsData> {
  const prisma = getPrisma();
  const accounts = await prisma.kalshiAccount.findMany({
    where: { appUserId },
    select: { id: true },
  });
  const accountIds = accounts.map((account) => account.id);
  if (accountIds.length === 0) return emptySportsAnalytics();

  const [fills, fillAnalytics, settlements, positions, eventPositions, orders, storedClassifications, latestSyncRun] = await Promise.all([
    prisma.fill.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { market: { include: { event: true } } },
      orderBy: { createdTime: "asc" },
    }),
    prisma.sportsFillAnalytics.findMany({
      where: { kalshiAccountId: { in: accountIds } },
    }),
    prisma.settlement.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { market: { include: { event: true } } },
      orderBy: { settledTime: "asc" },
    }),
    prisma.position.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { market: { include: { event: true } } },
    }),
    prisma.eventPosition.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { event: true },
    }),
    prisma.order.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { createdTime: "asc" },
    }),
    prisma.sportsMarketClassification.findMany(),
    prisma.syncRun.findFirst({
      where: { appUserId },
      orderBy: { startedAt: "desc" },
      select: { status: true, errorMessage: true, stats: true },
    }),
  ]);

  const storedByTicker = new Map(storedClassifications.map((classification) => [classification.marketTicker, storedClassificationToResult(classification)]));
  const runtimeClassificationsByTicker = new Map(storedByTicker);
  const classificationForFill = (fill: FillForClassification) => storedByTicker.get(fill.marketTicker) ?? classifySportsFill(fill);

  const analyticsByFillId = new Map(fillAnalytics.map((row) => [row.fillId, row]));
  const classifiedFills = fills.reduce<ClassifiedFill[]>((rows, fill) => {
    const classification = classificationForFill(fill);
    if (!classification.isSports) return rows;
    runtimeClassificationsByTicker.set(fill.marketTicker, classification);
    rows.push({
      fillId: fill.fillId,
      orderId: fill.orderId,
      marketTicker: fill.marketTicker,
      outcomeSide: fill.outcomeSide,
      action: fill.action,
      contractCount: fill.contractCount,
      priceCents: fill.priceCents,
      feeCents: fill.feeCents,
      createdTime: fill.createdTime,
      classification,
      closeTime: marketCloseTime(fill.market),
      analytics: analyticsByFillId.get(fill.fillId) ?? null,
    });
    return rows;
  }, []);

  const diagnostics = buildSportsDiagnostics({ fills, classifiedFills, latestSyncRun });
  if (classifiedFills.length === 0) return emptySportsAnalytics(diagnostics);

  const classificationForMarket = (market: MarketForClassification & { event: EventForClassification }) =>
    runtimeClassificationsByTicker.get(market.ticker) ?? classifySportsMarket(market, market.event);

  const sportsMarkets = new Set(classifiedFills.map((fill) => fill.marketTicker));
  const sportsSettlements = settlements.filter((settlement) => sportsMarkets.has(settlement.marketTicker));
  const settlementPnlByMarket = mapSettlementPnlByMarket(sportsSettlements);
  const costByMarket = mapFillCostByMarket(classifiedFills);
  const sportsPositions = positions.filter((position) => sportsMarkets.has(position.marketTicker));
  const sportsEventTickers = new Set(classifiedFills.map((fill) => fill.classification.eventTicker).filter((ticker): ticker is string => Boolean(ticker)));
  const sportsEventPositions = eventPositions.filter((position) => sportsEventTickers.has(position.eventTicker));
  const sportsOrders = orders.filter((order) => sportsMarkets.has(order.marketTicker));

  const netPnlCents = sportsSettlements.reduce((sum, settlement) => sum + (settlement.realizedPnlCents ?? 0), 0);
  const costBasisCents = Array.from(costByMarket.values()).reduce((sum, value) => sum + value, 0);
  const feeDragCents = classifiedFills.reduce((sum, fill) => sum + fill.feeCents, 0);
  const resolvedSettlements = sportsSettlements.filter((settlement) => settlement.realizedPnlCents != null);
  const winningSettlements = resolvedSettlements.filter((settlement) => (settlement.realizedPnlCents ?? 0) > 0).length;
  const averageClvCents = average(classifiedFills.map((fill) => fill.analytics?.clvCloseCents ?? null));
  const openExposureCents = openSportsExposureCents(sportsPositions, sportsEventPositions);

  const byLeague = buildPnlRows(sportsSettlements, classificationForMarket, (classification) => classification.league ?? "Unknown league");
  const byMarketType = buildPnlRows(sportsSettlements, classificationForMarket, (classification) => classification.marketType ?? "Other");
  const equity = buildSportsEquity(sportsSettlements);
  const favoritePerformance = groupFillsByBucket(classifiedFills, settlementPnlByMarket, costByMarket);
  const calibration = buildCalibrationRows(classifiedFills, sportsSettlements, settlementPnlByMarket);
  const clvDistribution = buildClvDistribution(classifiedFills);
  const entryTiming = buildEntryTimingRows(classifiedFills, sportsSettlements, settlementPnlByMarket);
  const risk = buildRiskRows(sportsPositions, sportsEventPositions, classificationForMarket, runtimeClassificationsByTicker);
  const execution = buildExecutionMetrics(sportsOrders, classifiedFills);
  const teamBias = buildTeamBiasRows(classifiedFills, settlementPnlByMarket, costByMarket);

  return {
    hasSportsData: true,
    kpis: {
      netPnlCents,
      roi: costBasisCents === 0 ? null : netPnlCents / costBasisCents,
      winRate: resolvedSettlements.length === 0 ? null : winningSettlements / resolvedSettlements.length,
      averageClvCents,
      openExposureCents,
      feeDragCents,
    },
    overview: {
      equity,
      leaguePnl: byLeague,
      marketTypePnl: byMarketType,
      favoritePerformance,
    },
    clv: {
      distribution: clvDistribution,
      calibration,
      entryTiming,
    },
    risk,
    execution,
    behavior: {
      teamBias,
      alerts: buildBehaviorAlerts({ favoritePerformance, teamBias, entryTiming, classifiedFills, settlementPnlByMarket, costByMarket }),
    },
    diagnostics,
  };
}

export function classifySportsFill(fill: FillForClassification): SportsClassification {
  return classifySportsContext(fill.market, fill.market.event, fill);
}

export function classifySportsMarket(market: MarketForClassification, event: EventForClassification = null): SportsClassification {
  return classifySportsContext(market, event);
}

function classifySportsContext(
  market: MarketForClassification,
  event: EventForClassification = null,
  fill: Pick<FillForClassification, "marketTicker" | "eventTicker" | "rawJson"> | null = null,
): SportsClassification {
  const rawFill = asRecord(fill?.rawJson);
  const rawMarket = asRecord(market.rawJson);
  const rawEvent = asRecord(event?.rawJson);
  const marketTicker = fill?.marketTicker ?? market.ticker;
  const eventTicker =
    fill?.eventTicker ??
    market.eventTicker ??
    event?.ticker ??
    rawTextFromRecords([rawFill, rawMarket, rawEvent], ["event_ticker", "eventTicker"]) ??
    null;
  const tickerCorpus = [
    marketTicker,
    eventTicker,
    market.ticker,
    market.eventTicker,
    event?.ticker,
    ...rawStringValues(rawFill, ["market_ticker", "ticker", "event_ticker", "series_ticker"]),
    ...rawStringValues(rawMarket, ["market_ticker", "ticker", "event_ticker", "series_ticker"]),
    ...rawStringValues(rawEvent, ["market_ticker", "ticker", "event_ticker", "series_ticker"]),
  ]
    .filter(Boolean)
    .join(" ");
  const corpus = [
    tickerCorpus,
    market.title,
    market.subtitle,
    market.category,
    event?.title,
    event?.category,
    flattenText(rawFill),
    flattenText(rawMarket),
    flattenText(rawEvent),
  ]
    .filter(Boolean)
    .join(" ");
  const marketEventCategoryText = [
    market.category,
    event?.category,
    rawTextFromRecords([rawMarket, rawEvent], ["category", "category_name", "market_category", "event_category", "series_category"]),
  ]
    .filter(Boolean)
    .join(" ");
  const fillCategoryText = rawTextFromRecords([rawFill], ["category", "category_name", "market_category", "event_category", "series_category"]) ?? "";
  const explicitMarketEventSports = /\bsports?\b/i.test(marketEventCategoryText);
  const explicitFillSports = /\bsports?\b/i.test(fillCategoryText);
  const explicitExotics = /\bexotics?\b/i.test([marketEventCategoryText, fillCategoryText].filter(Boolean).join(" "));
  const kalshiSportsFamilySignal = hasKalshiSportsFamilyTickerSignal(tickerCorpus);
  const crossCategorySignal = hasKalshiCrossCategoryTickerSignal(tickerCorpus);
  const teamMatches = detectSportsTeamAliases([
    market.title,
    market.subtitle,
    event?.title,
    rawTextFromRecords([rawFill, rawMarket, rawEvent], ["title", "sub_title", "event_title", "event_name", "market_title"]),
  ]);
  const teamLeague = inferLeagueFromTeamAliases(teamMatches);
  const teamEvidenceSignal = teamMatches.length >= 2 || teamMatches.some((match) => match.confidence >= 90);
  const tickerLeague = detectLeagueFromTicker(tickerCorpus);
  const league = tickerLeague ?? detectLeague(corpus) ?? teamLeague;
  const rawSport = rawTextFromRecords([rawFill, rawMarket, rawEvent], ["sport", "sport_name"]);
  const sport = detectSport([corpus, rawSport].filter(Boolean).join(" "), league) ?? (explicitMarketEventSports || explicitFillSports ? "Unknown" : null);
  const tickerSignal = Boolean(tickerLeague) || hasSportsTickerSignal(tickerCorpus) || kalshiSportsFamilySignal || (crossCategorySignal && teamEvidenceSignal);
  const exoticsSportsSignal = explicitExotics && (kalshiSportsFamilySignal || teamEvidenceSignal || Boolean(league));
  const metadataSource = explicitMarketEventSports || hasSportsMetadata(rawMarket) || hasSportsMetadata(rawEvent);
  const fillRawSource = explicitFillSports || hasSportsMetadata(rawFill);
  const isSports = metadataSource || fillRawSource || tickerSignal || exoticsSportsSignal || Boolean(league) || Boolean(sport);
  const teams = extractTeams(market, event, teamMatches, rawMarket, rawEvent, rawFill);
  const classificationSource: SportsClassificationSource = metadataSource ? "metadata" : fillRawSource ? "fill_raw" : tickerSignal ? "ticker_heuristic" : "heuristic";

  return {
    marketTicker,
    eventTicker,
    eventName: event?.title ?? rawTextFromRecords([rawEvent, rawFill, rawMarket], ["event_title", "event_name", "title", "sub_title"]) ?? null,
    sport,
    league,
    marketType: detectMarketType(corpus, rawFill, rawMarket, rawEvent),
    teams,
    primaryTeam: teams[0] ?? rawTextFromRecords([rawFill, rawMarket, rawEvent], ["primary_participant_key", "primary_team"]) ?? null,
    opponentTeam: teams[1] ?? null,
    classificationSource,
    confidence: sportsClassificationConfidence({ isSports, metadataSource, fillRawSource, tickerSignal, league, sport }),
    isSports,
    rawJson: {
      marketTicker,
      eventTicker,
      marketCategory: market.category,
      eventCategory: event?.category ?? null,
      matchedLeague: league,
      matchedSport: sport,
      matchedTeams: teams,
      kalshiSportsFamilySignal,
      crossCategorySignal,
      exoticsSportsSignal,
      classificationSource,
    },
  };
}

export function priceBucketForCents(priceCents: number) {
  if (priceCents < 25) return "Longshot";
  if (priceCents < 45) return "Underdog";
  if (priceCents <= 55) return "Coin flip";
  if (priceCents <= 75) return "Favorite";
  return "Heavy favorite";
}

export function chosenSidePriceCents(outcomeSide: OutcomeSide | "yes" | "no" | "unknown", yesPriceCents: number | null | undefined) {
  if (yesPriceCents == null) return null;
  if (outcomeSide === "no") return clampCents(100 - yesPriceCents);
  if (outcomeSide === "yes") return clampCents(yesPriceCents);
  return null;
}

export function clvCents(outcomeSide: OutcomeSide | "yes" | "no" | "unknown", entryPriceCents: number, laterYesPriceCents: number | null | undefined) {
  const laterChosen = chosenSidePriceCents(outcomeSide, laterYesPriceCents);
  return laterChosen == null ? null : laterChosen - entryPriceCents;
}

async function upsertSportsClassifications(prisma: ReturnType<typeof getPrisma>, classifications: SportsClassification[]) {
  for (const classification of classifications) {
    await prisma.sportsMarketClassification.upsert({
      where: { marketTicker: classification.marketTicker },
      create: {
        marketTicker: classification.marketTicker,
        eventTicker: classification.eventTicker,
        eventName: classification.eventName,
        sport: classification.sport,
        league: classification.league,
        marketType: classification.marketType,
        teams: classification.teams,
        primaryTeam: classification.primaryTeam,
        opponentTeam: classification.opponentTeam,
        classificationSource: classification.classificationSource,
        confidence: classification.confidence,
        rawJson: classification.rawJson as Prisma.InputJsonValue,
      },
      update: {
        eventTicker: classification.eventTicker,
        eventName: classification.eventName,
        sport: classification.sport,
        league: classification.league,
        marketType: classification.marketType,
        teams: classification.teams,
        primaryTeam: classification.primaryTeam,
        opponentTeam: classification.opponentTeam,
        classificationSource: classification.classificationSource,
        confidence: classification.confidence,
        rawJson: classification.rawJson as Prisma.InputJsonValue,
      },
    });
  }
}

async function importTargetedCandlesticks(
  prisma: ReturnType<typeof getPrisma>,
  client: KalshiRestClient,
  fills: SportsFill[],
  classificationsByTicker: Map<string, SportsClassification>,
  warnings: string[],
) {
  const rangesByTicker = buildCandleRanges(fills, classificationsByTicker);
  const created: Prisma.MarketCandlestickCreateManyInput[] = [];
  let rangeCount = 0;

  for (const [ticker, ranges] of rangesByTicker) {
    for (const range of ranges) {
      if (rangeCount >= MAX_CANDLE_RANGES_PER_SYNC) {
        pushWarningOnce(warnings, `sports analytics: skipped candle ranges after ${MAX_CANDLE_RANGES_PER_SYNC} targeted windows`);
        break;
      }
      rangeCount += 1;
      const candles = await fetchCandlesticks(client, ticker, range.startTs, range.endTs, warnings);
      created.push(...candles);
    }
  }

  const deduped = dedupeBy(created, (candle) => `${candle.marketTicker}:${candle.periodIntervalMinutes}:${new Date(candle.endPeriod).toISOString()}`);
  if (deduped.length) {
    await prisma.marketCandlestick.createMany({ data: deduped, skipDuplicates: true });
  }
  return deduped.length;
}

function buildCandleRanges(fills: SportsFill[], classificationsByTicker: Map<string, SportsClassification>) {
  const now = Date.now();
  const rangesByTicker = new Map<string, Array<{ startTs: number; endTs: number }>>();

  for (const fill of fills) {
    if (!classificationsByTicker.has(fill.marketTicker)) continue;
    for (const target of clvTargetTimes(fill)) {
      if (target.getTime() > now) continue;
      const startTs = Math.max(0, Math.floor(target.getTime() / 1000) - CANDLE_PADDING_SECONDS);
      const endTs = Math.floor(target.getTime() / 1000) + CANDLE_PADDING_SECONDS;
      const ranges = rangesByTicker.get(fill.marketTicker) ?? [];
      ranges.push({ startTs, endTs });
      rangesByTicker.set(fill.marketTicker, ranges);
    }
  }

  for (const [ticker, ranges] of rangesByTicker) {
    ranges.sort((left, right) => left.startTs - right.startTs);
    const merged: Array<{ startTs: number; endTs: number }> = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && range.startTs <= previous.endTs + CANDLE_PADDING_SECONDS) {
        previous.endTs = Math.max(previous.endTs, range.endTs);
      } else {
        merged.push({ ...range });
      }
    }
    rangesByTicker.set(ticker, merged);
  }

  return rangesByTicker;
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
    if (!isKalshiNotFoundError(error)) pushWarningOnce(warnings, `sports candles ${ticker}: ${shortError(error)}`);
  }

  try {
    const historical = await client.getHistoricalMarketCandlesticks(ticker, {
      start_ts: startTs,
      end_ts: endTs,
      period_interval: CANDLE_PERIOD_MINUTES,
    });
    return normalizeSingleMarketCandlesticks(historical, ticker);
  } catch (error) {
    pushWarningOnce(warnings, `sports historical candles ${ticker}: ${shortError(error)}`);
    return [];
  }
}

function normalizeBatchCandlesticks(value: unknown) {
  const rows: Prisma.MarketCandlestickCreateManyInput[] = [];
  for (const market of arrayFrom(asRecord(value), "markets")) {
    const marketRecord = asRecord(market);
    const ticker = rawText(marketRecord, ["market_ticker", "ticker"]);
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
  const ticker = rawText(record, ["market_ticker", "ticker"]) ?? fallbackTicker;
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
    volume: fixedPointOrNull(candle, ["volume_fp", "volume"]),
    openInterest: fixedPointOrNull(candle, ["open_interest_fp", "open_interest"]),
    rawJson: candle as Prisma.InputJsonValue,
  };
}

async function importOpenSportsOrderbooks(
  prisma: ReturnType<typeof getPrisma>,
  client: KalshiRestClient,
  positions: Array<PositionInput>,
  eventPositions: Array<EventPositionInput>,
  classificationsByTicker: Map<string, SportsClassification>,
  warnings: string[],
) {
  const openEventTickers = new Set(
    eventPositions
      .filter((position) => Number(position.totalCostShares) !== 0 || (position.eventExposureCents ?? 0) !== 0)
      .map((position) => position.eventTicker),
  );
  const tickers = new Set<string>();
  for (const position of positions) {
    if (Number(position.positionContracts) === 0) continue;
    if (classificationsByTicker.has(position.marketTicker)) tickers.add(position.marketTicker);
  }
  for (const classification of classificationsByTicker.values()) {
    if (classification.eventTicker && openEventTickers.has(classification.eventTicker)) tickers.add(classification.marketTicker);
  }
  if (tickers.size === 0) return 0;

  const observedAt = new Date();
  const rows: Prisma.OrderbookSnapshotCreateManyInput[] = [];
  for (const chunk of chunks(Array.from(tickers), 100)) {
    try {
      const result = await client.getMultipleMarketOrderbooks(chunk);
      rows.push(...normalizeOrderbooks(result, observedAt));
    } catch (error) {
      pushWarningOnce(warnings, `sports orderbooks: ${shortError(error)}`);
    }
  }

  if (rows.length) await prisma.orderbookSnapshot.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

function normalizeOrderbooks(value: unknown, observedAt: Date) {
  return arrayFrom(asRecord(value), "orderbooks")
    .map((rawOrderbook) => normalizeOrderbook(rawOrderbook, observedAt))
    .filter((row): row is Prisma.OrderbookSnapshotCreateManyInput => Boolean(row));
}

function normalizeOrderbook(rawOrderbook: unknown, observedAt: Date): Prisma.OrderbookSnapshotCreateManyInput | null {
  const row = asRecord(rawOrderbook);
  const ticker = rawText(row, ["ticker", "market_ticker"]);
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

async function upsertSportsFillAnalytics(
  prisma: ReturnType<typeof getPrisma>,
  kalshiAccountId: string,
  fills: SportsFill[],
  classificationsByTicker: Map<string, SportsClassification>,
) {
  const tickers = Array.from(new Set(fills.map((fill) => fill.marketTicker)));
  const [candles, snapshots] = await Promise.all([
    prisma.marketCandlestick.findMany({
      where: { marketTicker: { in: tickers }, periodIntervalMinutes: CANDLE_PERIOD_MINUTES },
      orderBy: { endPeriod: "asc" },
    }),
    prisma.orderbookSnapshot.findMany({
      where: { marketTicker: { in: tickers } },
      orderBy: { observedAt: "asc" },
    }),
  ]);
  const candlesByTicker = groupBy(candles, (candle) => candle.marketTicker);
  const snapshotsByTicker = groupBy(snapshots, (snapshot) => snapshot.marketTicker);

  for (const fill of fills) {
    const classification = classificationsByTicker.get(fill.marketTicker);
    if (!classification) continue;
    const entryPriceCents = fill.priceCents;
    const fillCandles = candlesByTicker.get(fill.marketTicker) ?? [];
    const clvValues = clvValuesForFill(fill, fillCandles);
    const nearestSnapshot = nearestSnapshotForFill(fill, snapshotsByTicker.get(fill.marketTicker) ?? []);
    const sideMidpoint = chosenSidePriceCents(fill.outcomeSide, nearestSnapshot?.midpointCents ?? null);
    const slippageCents = sideMidpoint == null ? null : fill.action?.toLowerCase() === "sell" ? sideMidpoint - entryPriceCents : entryPriceCents - sideMidpoint;

    await prisma.sportsFillAnalytics.upsert({
      where: { kalshiAccountId_fillId: { kalshiAccountId, fillId: fill.fillId } },
      create: {
        kalshiAccountId,
        fillId: fill.fillId,
        marketTicker: fill.marketTicker,
        eventTicker: classification.eventTicker,
        sport: classification.sport,
        league: classification.league,
        team: classification.primaryTeam,
        opponentTeam: classification.opponentTeam,
        marketType: classification.marketType,
        chosenSide: fill.outcomeSide,
        entryPriceCents,
        priceBucket: priceBucketForCents(entryPriceCents),
        ...clvValues,
        nearestOrderbookObservedAt: nearestSnapshot?.observedAt ?? null,
        midPriceCents: sideMidpoint,
        spreadCents: nearestSnapshot?.spreadCents ?? null,
        slippageCents,
      },
      update: {
        eventTicker: classification.eventTicker,
        sport: classification.sport,
        league: classification.league,
        team: classification.primaryTeam,
        opponentTeam: classification.opponentTeam,
        marketType: classification.marketType,
        chosenSide: fill.outcomeSide,
        entryPriceCents,
        priceBucket: priceBucketForCents(entryPriceCents),
        ...clvValues,
        nearestOrderbookObservedAt: nearestSnapshot?.observedAt ?? null,
        midPriceCents: sideMidpoint,
        spreadCents: nearestSnapshot?.spreadCents ?? null,
        slippageCents,
      },
    });
  }
}

function clvValuesForFill(fill: SportsFill, candles: CandlestickRow[]) {
  const byTarget = Object.fromEntries(
    CLV_TARGETS.map((target) => {
      const targetDate = new Date(fill.createdTime.getTime() + target.offsetMs);
      const candle = nearestCandle(candles, targetDate);
      return [target.key, clvCents(fill.outcomeSide, fill.priceCents, candle?.priceCloseCents)];
    }),
  ) as Record<(typeof CLV_TARGETS)[number]["key"], number | null>;
  const closeTarget = marketCloseTime(fill.market);
  const closeCandle = closeTarget ? nearestCandle(candles, closeTarget) : null;

  return {
    clv15mCents: byTarget.clv15mCents,
    clv1hCents: byTarget.clv1hCents,
    clv6hCents: byTarget.clv6hCents,
    clv24hCents: byTarget.clv24hCents,
    clvCloseCents: clvCents(fill.outcomeSide, fill.priceCents, closeCandle?.priceCloseCents),
  };
}

function clvTargetTimes(fill: SportsFill) {
  const targets = CLV_TARGETS.map((target) => new Date(fill.createdTime.getTime() + target.offsetMs));
  const closeTarget = marketCloseTime(fill.market);
  if (closeTarget) targets.push(closeTarget);
  return targets;
}

function nearestCandle(candles: CandlestickRow[], target: Date) {
  let best: CandlestickRow | null = null;
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

function nearestSnapshotForFill(fill: FillAnalyticsInput, snapshots: OrderbookSnapshotRow[]) {
  let best: OrderbookSnapshotRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const snapshot of snapshots) {
    const distance = Math.abs(snapshot.observedAt.getTime() - fill.createdTime.getTime());
    if (distance < bestDistance) {
      best = snapshot;
      bestDistance = distance;
    }
  }
  return bestDistance <= ORDERBOOK_SNAPSHOT_DISTANCE_MS ? best : null;
}

function buildPnlRows(
  settlements: SettlementInput[],
  classificationForMarket: (market: MarketForClassification & { event: EventForClassification }) => SportsClassification,
  labelFor: (classification: SportsClassification) => string,
) {
  const totals = new Map<string, number>();
  for (const settlement of settlements) {
    const classification = classificationForMarket(settlement.market);
    const label = labelFor(classification);
    totals.set(label, (totals.get(label) ?? 0) + (settlement.realizedPnlCents ?? 0));
  }
  return Array.from(totals.entries())
    .map(([label, valueCents]) => ({ label, valueCents }))
    .sort((left, right) => right.valueCents - left.valueCents);
}

function buildSportsEquity(settlements: SettlementInput[]) {
  let total = 0;
  return settlements
    .filter((settlement) => settlement.settledTime)
    .sort((left, right) => (left.settledTime?.getTime() ?? 0) - (right.settledTime?.getTime() ?? 0))
    .map((settlement) => {
      total += settlement.realizedPnlCents ?? 0;
      return {
        date: settlement.settledTime?.toISOString() ?? new Date().toISOString(),
        valueCents: total,
      };
    });
}

function groupFillsByBucket(classifiedFills: ClassifiedFill[], settlementPnlByMarket: Map<string, number>, costByMarket: Map<string, number>) {
  const groups = new Map<string, GroupMetric>();
  for (const fill of classifiedFills) {
    const bucket = priceBucketForCents(fill.priceCents);
    const group = ensureGroup(groups, bucket);
    group.fills += 1;
    group.costCents += fillCostCents(fill);
  }

  for (const [marketTicker, pnl] of settlementPnlByMarket) {
    const marketFills = classifiedFills.filter((fill) => fill.marketTicker === marketTicker);
    if (!marketFills.length) continue;
    const bucket = priceBucketForCents(weightedAveragePrice(marketFills));
    const group = ensureGroup(groups, bucket);
    group.realizedPnlCents += pnl;
    group.costCents += costByMarket.get(marketTicker) ?? 0;
  }

  return bucketOrder()
    .filter((bucket) => groups.has(bucket))
    .map((bucket) => {
      const group = groups.get(bucket)!;
      return {
        bucket,
        fills: group.fills,
        realizedPnlCents: group.realizedPnlCents,
        roi: group.costCents === 0 ? null : group.realizedPnlCents / group.costCents,
      };
    });
}

function buildCalibrationRows(classifiedFills: ClassifiedFill[], settlements: SettlementInput[], settlementPnlByMarket: Map<string, number>) {
  const settledMarkets = new Set(settlements.filter((settlement) => settlement.realizedPnlCents != null).map((settlement) => settlement.marketTicker));
  const groups = new Map<string, GroupMetric>();

  for (const marketTicker of settledMarkets) {
    const marketFills = classifiedFills.filter((fill) => fill.marketTicker === marketTicker);
    if (!marketFills.length) continue;
    const avgPrice = weightedAveragePrice(marketFills);
    const bucket = priceBucketForCents(avgPrice);
    const group = ensureGroup(groups, bucket);
    group.settled += 1;
    group.impliedSum += avgPrice / 100;
    if ((settlementPnlByMarket.get(marketTicker) ?? 0) > 0) group.wins += 1;
  }

  return bucketOrder().map((bucket) => {
    const group = groups.get(bucket);
    return {
      bucket,
      impliedProbability: group && group.settled > 0 ? group.impliedSum / group.settled : bucketImpliedProbability(bucket),
      actualWinRate: group && group.settled > 0 ? group.wins / group.settled : null,
      fills: group?.settled ?? 0,
    };
  });
}

function buildClvDistribution(classifiedFills: ClassifiedFill[]) {
  const buckets = [
    { bucket: "< -10c", min: -Infinity, max: -10 },
    { bucket: "-10c to -3c", min: -10, max: -3 },
    { bucket: "-3c to +3c", min: -3, max: 3 },
    { bucket: "+3c to +10c", min: 3, max: 10 },
    { bucket: "> +10c", min: 10, max: Infinity },
  ];
  return buckets.map((bucket) => ({
    bucket: bucket.bucket,
    fills: classifiedFills.filter((fill) => {
      const clv = fill.analytics?.clvCloseCents;
      return clv != null && clv >= bucket.min && clv < bucket.max;
    }).length,
  }));
}

function buildEntryTimingRows(classifiedFills: ClassifiedFill[], settlements: SettlementInput[], settlementPnlByMarket: Map<string, number>) {
  const settlementMarkets = new Set(settlements.map((settlement) => settlement.marketTicker));
  const groups = new Map<string, GroupMetric>();
  for (const fill of classifiedFills) {
    const bucket = entryTimingBucket(fill);
    const group = ensureGroup(groups, bucket);
    group.fills += 1;
    const clv = fill.analytics?.clvCloseCents;
    if (clv != null) {
      group.clvSum += clv;
      group.clvCount += 1;
    }
    if (settlementMarkets.has(fill.marketTicker)) {
      const marketFills = classifiedFills.filter((entry) => entry.marketTicker === fill.marketTicker).length || 1;
      group.realizedPnlCents += Math.round((settlementPnlByMarket.get(fill.marketTicker) ?? 0) / marketFills);
    }
  }

  return ["0-30m", "30m-2h", "2h-24h", ">24h", "Unknown"].map((bucket) => {
    const group = groups.get(bucket);
    return {
      bucket,
      fills: group?.fills ?? 0,
      realizedPnlCents: group?.realizedPnlCents ?? 0,
      averageClvCents: group && group.clvCount > 0 ? group.clvSum / group.clvCount : null,
    };
  });
}

function buildRiskRows(
  positions: PositionInput[],
  eventPositions: EventPositionInput[],
  classificationForMarket: (market: MarketForClassification & { event: EventForClassification }) => SportsClassification,
  storedByTicker: Map<string, SportsClassification>,
): SportsAnalyticsData["risk"] {
  const exposureRows: Array<{
    sport: string;
    league: string;
    team: string;
    eventTicker: string;
    eventName: string;
    exposureCents: number;
    resolvesAt: Date | null;
  }> = [];
  const coveredEvents = new Set<string>();

  for (const eventPosition of eventPositions) {
    if (Number(eventPosition.totalCostShares) === 0 && (eventPosition.eventExposureCents ?? 0) === 0) continue;
    const eventClassifications = Array.from(storedByTicker.values()).filter((classification) => classification.eventTicker === eventPosition.eventTicker);
    const classification = eventClassifications[0];
    if (!classification) continue;
    coveredEvents.add(eventPosition.eventTicker);
    exposureRows.push({
      sport: classification.sport ?? "Unknown sport",
      league: classification.league ?? "Unknown league",
      team: classification.primaryTeam ?? "Unknown team",
      eventTicker: eventPosition.eventTicker,
      eventName: eventPosition.event?.title ?? classification.eventName ?? eventPosition.eventTicker,
      exposureCents: eventPosition.eventExposureCents ?? 0,
      resolvesAt: null,
    });
  }

  for (const position of positions) {
    if (Number(position.positionContracts) === 0) continue;
    if (position.eventTicker && coveredEvents.has(position.eventTicker)) continue;
    const classification = classificationForMarket(position.market);
    if (!classification.isSports) continue;
    exposureRows.push({
      sport: classification.sport ?? "Unknown sport",
      league: classification.league ?? "Unknown league",
      team: classification.primaryTeam ?? "Unknown team",
      eventTicker: classification.eventTicker ?? position.marketTicker,
      eventName: classification.eventName ?? classification.eventTicker ?? position.marketTicker,
      exposureCents: position.exposureCents ?? 0,
      resolvesAt: marketCloseTime(position.market),
    });
  }

  const todayEnd = endOfDay(new Date(), 0);
  const tomorrowEnd = endOfDay(new Date(), 1);
  const weekEnd = endOfDay(new Date(), 7);

  return {
    bySport: exposureGroupRows(exposureRows, (row) => row.sport),
    byLeague: exposureGroupRows(exposureRows, (row) => row.league),
    byTeam: exposureGroupRows(exposureRows, (row) => row.team),
    byEvent: exposureGroupRows(exposureRows, (row) => row.eventTicker).map((row) => {
      const source = exposureRows.find((entry) => entry.eventTicker === row.label);
      return {
        eventTicker: row.label,
        eventName: source?.eventName ?? row.label,
        exposureCents: row.exposureCents,
        resolvesAt: source?.resolvesAt?.toISOString() ?? null,
      };
    }),
    resolving: [
      { window: "Today", exposureCents: exposureRows.filter((row) => row.resolvesAt && row.resolvesAt <= todayEnd).reduce((sum, row) => sum + row.exposureCents, 0) },
      { window: "Tomorrow", exposureCents: exposureRows.filter((row) => row.resolvesAt && row.resolvesAt > todayEnd && row.resolvesAt <= tomorrowEnd).reduce((sum, row) => sum + row.exposureCents, 0) },
      { window: "This week", exposureCents: exposureRows.filter((row) => row.resolvesAt && row.resolvesAt > tomorrowEnd && row.resolvesAt <= weekEnd).reduce((sum, row) => sum + row.exposureCents, 0) },
    ],
    worstCaseLossCents: exposureRows.reduce((sum, row) => sum + Math.max(0, row.exposureCents), 0),
  };
}

function buildExecutionMetrics(orders: OrderInput[], classifiedFills: ClassifiedFill[]): SportsAnalyticsData["execution"] {
  const orderCount = orders.length;
  const executed = orders.filter((order) => order.status === "executed" || Number(order.filledCount) > 0).length;
  const canceled = orders.filter((order) => order.status === "canceled").length;
  const partial = orders.filter((order) => Number(order.filledCount) > 0 && Number(order.remainingCount) > 0).length;
  const timeToFillMinutes = orders
    .map((order) => {
      if (!order.createdTime) return null;
      const fill =
        classifiedFills.find((entry) => entry.orderId === order.orderId && entry.createdTime >= order.createdTime!) ??
        classifiedFills.find((entry) => entry.marketTicker === order.marketTicker && entry.createdTime >= order.createdTime!);
      if (!fill) return null;
      return (fill.createdTime.getTime() - order.createdTime.getTime()) / ONE_MINUTE_MS;
    })
    .filter((value): value is number => value != null && Number.isFinite(value) && value >= 0);

  return {
    fillRate: orderCount === 0 ? null : executed / orderCount,
    cancelRate: orderCount === 0 ? null : canceled / orderCount,
    partialFillRate: orderCount === 0 ? null : partial / orderCount,
    averageTimeToFillMinutes: average(timeToFillMinutes),
    averageSpreadCents: average(classifiedFills.map((fill) => fill.analytics?.spreadCents ?? null)),
    averageSlippageCents: average(classifiedFills.map((fill) => fill.analytics?.slippageCents ?? null)),
    feesCents: classifiedFills.reduce((sum, fill) => sum + fill.feeCents, 0),
  };
}

function buildTeamBiasRows(classifiedFills: ClassifiedFill[], settlementPnlByMarket: Map<string, number>, costByMarket: Map<string, number>) {
  const groups = new Map<string, GroupMetric>();
  for (const fill of classifiedFills) {
    const team = fill.classification.primaryTeam ?? "Unknown team";
    const group = ensureGroup(groups, team);
    group.fills += 1;
    group.costCents += fillCostCents(fill);
  }
  for (const [marketTicker, pnl] of settlementPnlByMarket) {
    const fill = classifiedFills.find((entry) => entry.marketTicker === marketTicker);
    if (!fill) continue;
    const team = fill.classification.primaryTeam ?? "Unknown team";
    const group = ensureGroup(groups, team);
    group.realizedPnlCents += pnl;
    group.costCents += costByMarket.get(marketTicker) ?? 0;
  }
  return Array.from(groups.entries())
    .map(([team, group]) => ({
      team,
      fills: group.fills,
      realizedPnlCents: group.realizedPnlCents,
      roi: group.costCents === 0 ? null : group.realizedPnlCents / group.costCents,
    }))
    .sort((left, right) => right.fills - left.fills)
    .slice(0, 12);
}

function buildBehaviorAlerts(input: {
  favoritePerformance: Array<{ bucket: string; fills: number; realizedPnlCents: number; roi: number | null }>;
  teamBias: Array<{ team: string; fills: number; realizedPnlCents: number; roi: number | null }>;
  entryTiming: Array<{ bucket: string; fills: number; realizedPnlCents: number; averageClvCents: number | null }>;
  classifiedFills: ClassifiedFill[];
  settlementPnlByMarket: Map<string, number>;
  costByMarket: Map<string, number>;
}): SportsAnalyticsData["behavior"]["alerts"] {
  const alerts: SportsAnalyticsData["behavior"]["alerts"] = [];
  const favorite = input.favoritePerformance.find((row) => row.bucket === "Favorite");
  const heavyFavorite = input.favoritePerformance.find((row) => row.bucket === "Heavy favorite");
  const longshot = input.favoritePerformance.find((row) => row.bucket === "Longshot");
  const late = input.entryTiming.find((row) => row.bucket === "0-30m");
  const topTeam = input.teamBias[0];

  if (((favorite?.roi ?? 0) < 0 && (favorite?.fills ?? 0) >= 3) || ((heavyFavorite?.roi ?? 0) < 0 && (heavyFavorite?.fills ?? 0) >= 3)) {
    alerts.push({
      id: "favorite-bias",
      title: "Favorite bias",
      detail: "Favorite-side entries are negative ROI in resolved sports markets.",
      tone: "negative",
    });
  }
  if ((longshot?.roi ?? 0) < 0 && (longshot?.fills ?? 0) >= 3) {
    alerts.push({
      id: "longshot-bias",
      title: "Longshot bias",
      detail: "Longshot entries are negative ROI after settlement.",
      tone: "negative",
    });
  }
  if (topTeam && topTeam.fills >= Math.max(4, input.classifiedFills.length * 0.4) && (topTeam.roi ?? 0) < 0) {
    alerts.push({
      id: "team-bias",
      title: "Team bias",
      detail: `${topTeam.team} accounts for a large share of sports fills with negative ROI.`,
      tone: "negative",
    });
  }
  if (late && late.fills >= 3 && late.realizedPnlCents < 0) {
    alerts.push({
      id: "late-entry",
      title: "Late-entry weakness",
      detail: "Entries inside 30 minutes of close are underperforming.",
      tone: "negative",
    });
  }
  const steamFollowing = input.classifiedFills.filter((fill) => (fill.analytics?.clv6hCents ?? 0) <= -10).length;
  if (steamFollowing >= 3) {
    alerts.push({
      id: "steam-following",
      title: "Chase / steam following",
      detail: "Several fills lost at least 10c of six-hour CLV after entry.",
      tone: "negative",
    });
  }
  const overtrade = overtradingAlert(input.classifiedFills, input.settlementPnlByMarket);
  if (overtrade) alerts.push(overtrade);

  if (alerts.length === 0) {
    alerts.push({
      id: "insufficient-signal",
      title: "No behavior alerts",
      detail: "No sports betting behavior warning has enough real data to trigger.",
      tone: "neutral",
    });
  }

  return alerts;
}

function overtradingAlert(classifiedFills: ClassifiedFill[], settlementPnlByMarket: Map<string, number>) {
  const fillsByDay = groupBy(classifiedFills, (fill) => fill.createdTime.toISOString().slice(0, 10));
  const counts = Array.from(fillsByDay.values()).map((fills) => fills.length).sort((left, right) => left - right);
  if (counts.length < 4) return null;
  const median = counts[Math.floor(counts.length / 2)] || 0;
  for (const [day, fills] of fillsByDay) {
    if (median === 0 || fills.length < median * 2) continue;
    const markets = new Set(fills.map((fill) => fill.marketTicker));
    const pnl = Array.from(markets).reduce((sum, marketTicker) => sum + (settlementPnlByMarket.get(marketTicker) ?? 0), 0);
    if (pnl < 0) {
      return {
        id: "overtrading",
        title: "Overtrading by day",
        detail: `${day} had more than 2x normal sports fill count and negative resolved P/L.`,
        tone: "negative" as const,
      };
    }
  }
  return null;
}

function storedClassificationToResult(row: {
  marketTicker: string;
  eventTicker: string | null;
  eventName: string | null;
  sport: string | null;
  league: string | null;
  marketType: string | null;
  teams: string[];
  primaryTeam: string | null;
  opponentTeam: string | null;
  classificationSource: string;
  confidence: number;
  rawJson: unknown;
}): SportsClassification {
  return {
    marketTicker: row.marketTicker,
    eventTicker: row.eventTicker,
    eventName: row.eventName,
    sport: row.sport,
    league: row.league,
    marketType: row.marketType,
    teams: row.teams,
    primaryTeam: row.primaryTeam,
    opponentTeam: row.opponentTeam,
    classificationSource: sportsClassificationSource(row.classificationSource),
    confidence: row.confidence,
    isSports: true,
    rawJson: asRecord(row.rawJson),
  };
}

function sportsClassificationSource(value: string): SportsClassificationSource {
  if (value === "metadata" || value === "fill_raw" || value === "ticker_heuristic") return value;
  return "heuristic";
}

function buildSportsDiagnostics(input: {
  fills: Array<FillForClassification>;
  classifiedFills: ClassifiedFill[];
  latestSyncRun?: { status: unknown; errorMessage: string | null; stats: unknown } | null;
}): SportsAnalyticsData["diagnostics"] {
  const classifiedTickers = new Set(input.classifiedFills.map((fill) => fill.marketTicker));
  const unclassified = input.fills.filter((fill) => !classifiedTickers.has(fill.marketTicker));
  const warnings: string[] = [];
  const syncWarnings = syncWarningsFromStats(input.latestSyncRun?.stats).filter((warning) => /metadata|sports|market|event|classif/i.test(warning));

  if (input.fills.length > 0 && input.classifiedFills.length === 0) {
    warnings.push("Imported fills were found, but none matched the sports classifier.");
  }
  if (unclassified.some((fill) => isPlaceholderMarket(fill.market) || isPlaceholderEvent(fill.market.event))) {
    warnings.push("Some imported fills still have placeholder-only market or event metadata.");
  }
  if (input.latestSyncRun?.status === "failed" && input.latestSyncRun.errorMessage) {
    warnings.push(input.latestSyncRun.errorMessage);
  }

  return {
    totalImportedFills: input.fills.length,
    classifiedSportsFills: input.classifiedFills.length,
    unclassifiedFillSamples: unclassified.slice(0, 6).map((fill) => ({
      marketTicker: fill.marketTicker,
      eventTicker: fill.eventTicker ?? fill.market.eventTicker ?? fill.market.event?.ticker ?? null,
      title: fill.market.title ?? rawText(asRecord(fill.rawJson), ["title", "market_title"]) ?? null,
      category: fill.market.category ?? rawText(asRecord(fill.rawJson), ["category", "market_category"]) ?? null,
      reason: unclassifiedSportsReason(fill),
    })),
    classificationWarnings: uniqueStrings([...warnings, ...syncWarnings]).slice(0, 8),
  };
}

function syncWarningsFromStats(stats: unknown) {
  const row = asRecord(stats);
  const warnings = row.warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0);
}

function isPlaceholderMarket(market: MarketForClassification) {
  return rawText(asRecord(market.rawJson), ["source"]) === "kalshi-backfill-placeholder";
}

function isPlaceholderEvent(event: EventForClassification) {
  return event ? rawText(asRecord(event.rawJson), ["source"]) === "kalshi-backfill-placeholder" : false;
}

function unclassifiedSportsReason(fill: FillForClassification) {
  const rawFill = asRecord(fill.rawJson);
  const rawMarket = asRecord(fill.market.rawJson);
  const rawEvent = asRecord(fill.market.event?.rawJson);
  const tickerCorpus = [fill.marketTicker, fill.eventTicker, fill.market.ticker, fill.market.eventTicker, fill.market.event?.ticker].filter(Boolean).join(" ");
  const categoryText = [
    fill.market.category,
    fill.market.event?.category,
    rawTextFromRecords([rawFill, rawMarket, rawEvent], ["category", "category_name", "market_category", "event_category", "series_category"]),
  ]
    .filter(Boolean)
    .join(" ");

  if (isPlaceholderMarket(fill.market) || isPlaceholderEvent(fill.market.event)) return "Placeholder metadata; no sports signal found yet";
  if (hasKalshiCrossCategoryTickerSignal(tickerCorpus)) return "Cross-category ticker without enough team evidence";
  if (/\bexotics?\b/i.test(categoryText)) return "Exotics category without matched sports ticker or team evidence";
  return "No sports league, team, category, or ticker signal matched";
}

function emptySportsDiagnostics(): SportsAnalyticsData["diagnostics"] {
  return {
    totalImportedFills: 0,
    classifiedSportsFills: 0,
    unclassifiedFillSamples: [],
    classificationWarnings: [],
  };
}

function emptySportsAnalytics(diagnostics: SportsAnalyticsData["diagnostics"] = emptySportsDiagnostics()): SportsAnalyticsData {
  return {
    hasSportsData: false,
    kpis: {
      netPnlCents: null,
      roi: null,
      winRate: null,
      averageClvCents: null,
      openExposureCents: null,
      feeDragCents: null,
    },
    overview: {
      equity: [],
      leaguePnl: [],
      marketTypePnl: [],
      favoritePerformance: [],
    },
    clv: {
      distribution: [],
      calibration: [],
      entryTiming: [],
    },
    risk: {
      bySport: [],
      byLeague: [],
      byTeam: [],
      byEvent: [],
      resolving: [
        { window: "Today", exposureCents: 0 },
        { window: "Tomorrow", exposureCents: 0 },
        { window: "This week", exposureCents: 0 },
      ],
      worstCaseLossCents: 0,
    },
    execution: {
      fillRate: null,
      cancelRate: null,
      partialFillRate: null,
      averageTimeToFillMinutes: null,
      averageSpreadCents: null,
      averageSlippageCents: null,
      feesCents: 0,
    },
    behavior: {
      teamBias: [],
      alerts: [],
    },
    diagnostics,
  };
}

function mapSettlementPnlByMarket(settlements: SettlementInput[]) {
  const map = new Map<string, number>();
  for (const settlement of settlements) {
    map.set(settlement.marketTicker, (map.get(settlement.marketTicker) ?? 0) + (settlement.realizedPnlCents ?? 0));
  }
  return map;
}

function mapFillCostByMarket(fills: ClassifiedFill[]) {
  const map = new Map<string, number>();
  for (const fill of fills) {
    map.set(fill.marketTicker, (map.get(fill.marketTicker) ?? 0) + fillCostCents(fill));
  }
  return map;
}

function openSportsExposureCents(positions: PositionInput[], eventPositions: EventPositionInput[]) {
  const eventExposure = eventPositions
    .filter((position) => Number(position.totalCostShares) !== 0 || (position.eventExposureCents ?? 0) !== 0)
    .reduce((sum, position) => sum + (position.eventExposureCents ?? 0), 0);
  const coveredEvents = new Set(eventPositions.map((position) => position.eventTicker));
  const marketExposure = positions
    .filter((position) => Number(position.positionContracts) !== 0 && !(position.eventTicker && coveredEvents.has(position.eventTicker)))
    .reduce((sum, position) => sum + (position.exposureCents ?? 0), 0);
  return eventExposure + marketExposure;
}

function exposureGroupRows<T>(rows: T[], labelFor: (row: T) => string) {
  const totals = new Map<string, number>();
  for (const row of rows as Array<T & { exposureCents: number }>) {
    const label = labelFor(row);
    totals.set(label, (totals.get(label) ?? 0) + row.exposureCents);
  }
  return Array.from(totals.entries())
    .map(([label, exposureCents]) => ({ label, exposureCents }))
    .sort((left, right) => right.exposureCents - left.exposureCents);
}

function fillCostCents(fill: FillAnalyticsInput) {
  return Math.round(Number(fill.contractCount) * fill.priceCents);
}

function weightedAveragePrice(fills: FillAnalyticsInput[]) {
  const totalContracts = fills.reduce((sum, fill) => sum + Number(fill.contractCount), 0);
  if (totalContracts === 0) return 0;
  return Math.round(fills.reduce((sum, fill) => sum + Number(fill.contractCount) * fill.priceCents, 0) / totalContracts);
}

function entryTimingBucket(fill: ClassifiedFill) {
  if (!fill.closeTime) return "Unknown";
  const minutes = (fill.closeTime.getTime() - fill.createdTime.getTime()) / ONE_MINUTE_MS;
  if (minutes <= 30) return "0-30m";
  if (minutes <= 120) return "30m-2h";
  if (minutes <= 24 * 60) return "2h-24h";
  return ">24h";
}

function ensureGroup(groups: Map<string, GroupMetric>, key: string) {
  const existing = groups.get(key);
  if (existing) return existing;
  const created = { fills: 0, costCents: 0, realizedPnlCents: 0, clvSum: 0, clvCount: 0, wins: 0, settled: 0, impliedSum: 0 };
  groups.set(key, created);
  return created;
}

function bucketOrder() {
  return ["Longshot", "Underdog", "Coin flip", "Favorite", "Heavy favorite"];
}

function bucketImpliedProbability(bucket: string) {
  if (bucket === "Longshot") return 0.125;
  if (bucket === "Underdog") return 0.35;
  if (bucket === "Coin flip") return 0.5;
  if (bucket === "Favorite") return 0.65;
  return 0.875;
}

function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function marketCloseTime(market: MarketForClassification) {
  return market.closeTime ?? market.expirationTime ?? market.settlementTime ?? null;
}

const SPORTS_TEAM_ALIASES: Array<{
  team: string;
  league: string;
  sport: string;
  confidence: number;
  aliases: string[];
}> = [
  { team: "Philadelphia Phillies", league: "MLB", sport: "Baseball", confidence: 65, aliases: ["philadelphia", "philadelphia phillies", "phillies"] },
  { team: "Toronto Blue Jays", league: "MLB", sport: "Baseball", confidence: 65, aliases: ["toronto", "toronto blue jays", "blue jays"] },
  { team: "New York Mets", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["new york m", "ny m", "nym", "mets", "new york mets"] },
  { team: "Milwaukee Brewers", league: "MLB", sport: "Baseball", confidence: 65, aliases: ["milwaukee", "milwaukee brewers", "brewers"] },
  { team: "Houston Astros", league: "MLB", sport: "Baseball", confidence: 65, aliases: ["houston", "houston astros", "astros"] },
  { team: "New York Yankees", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["new york y", "ny y", "nyy", "yankees", "new york yankees"] },
  { team: "San Francisco Giants", league: "MLB", sport: "Baseball", confidence: 65, aliases: ["san francisco", "san francisco giants", "giants"] },
  { team: "Los Angeles Dodgers", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["los angeles d", "la d", "lad", "dodgers", "los angeles dodgers"] },
  { team: "Chicago Cubs", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["chicago c", "chc", "cubs", "chicago cubs"] },
  { team: "Athletics", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["a's", "as", "athletics", "oakland athletics", "oakland a's", "sacramento athletics"] },
  { team: "Seattle Mariners", league: "MLB", sport: "Baseball", confidence: 65, aliases: ["seattle", "seattle mariners", "mariners"] },
  { team: "Atlanta Braves", league: "MLB", sport: "Baseball", confidence: 65, aliases: ["atlanta", "atlanta braves", "braves"] },
  { team: "Boston Red Sox", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["boston r", "red sox", "boston red sox"] },
  { team: "Chicago White Sox", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["chicago w", "chw", "white sox", "chicago white sox"] },
  { team: "Los Angeles Angels", league: "MLB", sport: "Baseball", confidence: 95, aliases: ["los angeles a", "la a", "laa", "angels", "los angeles angels"] },
  { team: "Texas Rangers", league: "MLB", sport: "Baseball", confidence: 80, aliases: ["texas rangers", "rangers"] },
  { team: "Lakers", league: "NBA", sport: "Basketball", confidence: 95, aliases: ["lakers", "los angeles lakers"] },
  { team: "Celtics", league: "NBA", sport: "Basketball", confidence: 95, aliases: ["celtics", "boston celtics"] },
  { team: "Knicks", league: "NBA", sport: "Basketball", confidence: 95, aliases: ["knicks", "new york knicks"] },
  { team: "Warriors", league: "NBA", sport: "Basketball", confidence: 90, aliases: ["warriors", "golden state warriors"] },
  { team: "Chiefs", league: "NFL", sport: "Football", confidence: 95, aliases: ["chiefs", "kansas city chiefs"] },
  { team: "Eagles", league: "NFL", sport: "Football", confidence: 90, aliases: ["eagles", "philadelphia eagles"] },
  { team: "Cowboys", league: "NFL", sport: "Football", confidence: 95, aliases: ["cowboys", "dallas cowboys"] },
  { team: "Bills", league: "NFL", sport: "Football", confidence: 95, aliases: ["bills", "buffalo bills"] },
  { team: "Rangers", league: "NHL", sport: "Hockey", confidence: 90, aliases: ["new york rangers"] },
  { team: "Maple Leafs", league: "NHL", sport: "Hockey", confidence: 95, aliases: ["maple leafs", "toronto maple leafs"] },
  { team: "Canadiens", league: "NHL", sport: "Hockey", confidence: 95, aliases: ["canadiens", "montreal canadiens"] },
  { team: "Bruins", league: "NHL", sport: "Hockey", confidence: 95, aliases: ["bruins", "boston bruins"] },
];

function detectLeagueFromTicker(corpus: string) {
  const tokens = corpus
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const prefixes: Array<[string, RegExp]> = [
    ["NFL", /^(?:KX)?(?:NFL|SUPERBOWL|SB|PROFOOTBALL)/],
    ["NCAAF", /^(?:KX)?(?:NCAAF|CFB|COLLEGEFOOTBALL)/],
    ["NBA", /^(?:KX)?(?:NBA|PROBASKETBALL)/],
    ["WNBA", /^(?:KX)?WNBA/],
    ["NCAAB", /^(?:KX)?(?:NCAAB|CBB|NCAAMB|NCAAWB|COLLEGEBASKETBALL)/],
    ["MLB", /^(?:KX)?(?:MLB|PROBASEBALL)/],
    ["NHL", /^(?:KX)?(?:NHL|PROHOCKEY)/],
    ["MLS", /^(?:KX)?(?:MLS|MAJORLEAGUESOCCER)/],
    ["EPL", /^(?:KX)?(?:EPL|PREMIERLEAGUE)/],
    ["UCL", /^(?:KX)?(?:UCL|CHAMPIONSLEAGUE)/],
    ["UFC", /^(?:KX)?(?:UFC|MMA)/],
    ["PGA", /^(?:KX)?(?:PGA|GOLF)/],
    ["Tennis", /^(?:KX)?(?:TENNIS|ATP|WTA)/],
    ["NASCAR", /^(?:KX)?(?:NASCAR|F1|FORMULA1|MOTORSPORT)/],
    ["Esports", /^(?:KX)?(?:ESPORTS|LOL|VALORANT|CSGO|CS2)/],
  ];

  for (const token of tokens) {
    const league = prefixes.find(([, pattern]) => pattern.test(token))?.[0];
    if (league) return league;
  }
  return null;
}

function detectLeague(corpus: string) {
  const patterns: Array<[string, RegExp]> = [
    ["NFL", /\b(NFL|Pro Football)\b/i],
    ["NCAAF", /\b(College Football|NCAAF|CFB)\b/i],
    ["NBA", /\b(NBA|Pro Basketball|Basketball \(M\))\b/i],
    ["WNBA", /\bWNBA\b/i],
    ["NCAAB", /\b(College Basketball|NCAAB|College Men's Basketball|College Women'?s Basketball)\b/i],
    ["MLB", /\b(MLB|Pro Baseball|Baseball)\b/i],
    ["NHL", /\b(NHL|Pro Hockey|Hockey)\b/i],
    ["MLS", /\b(MLS|Major League Soccer)\b/i],
    ["EPL", /\b(EPL|Premier League)\b/i],
    ["UCL", /\b(Champions League|UCL)\b/i],
    ["UFC", /\b(UFC|MMA|Mixed Martial Arts)\b/i],
    ["PGA", /\b(PGA|Golf)\b/i],
    ["Tennis", /\b(Tennis|ATP|WTA)\b/i],
    ["NASCAR", /\b(NASCAR|Motorsport|Formula 1|F1)\b/i],
    ["Esports", /\b(Esports|League of Legends|Counter-Strike|Valorant)\b/i],
  ];
  return patterns.find(([, pattern]) => pattern.test(corpus))?.[0] ?? null;
}

function detectSport(corpus: string, league: string | null) {
  if (league === "NFL" || league === "NCAAF") return "Football";
  if (league === "NBA" || league === "WNBA" || league === "NCAAB") return "Basketball";
  if (league === "MLB") return "Baseball";
  if (league === "NHL") return "Hockey";
  if (league === "MLS" || league === "EPL" || league === "UCL") return "Soccer";
  if (league === "UFC") return "MMA";
  if (league === "PGA") return "Golf";
  if (league === "Tennis") return "Tennis";
  if (league === "NASCAR") return "Motorsport";
  if (league === "Esports") return "Esports";
  if (/\bfootball\b/i.test(corpus)) return "Football";
  if (/\bbasketball\b/i.test(corpus)) return "Basketball";
  if (/\bbaseball\b/i.test(corpus)) return "Baseball";
  if (/\bhockey\b/i.test(corpus)) return "Hockey";
  if (/\bsoccer\b/i.test(corpus)) return "Soccer";
  return null;
}

function hasSportsTickerSignal(corpus: string) {
  return /\bKX(?:SPORTS?|NFL|NCAAF|CFB|NBA|WNBA|NCAAB|CBB|MLB|NHL|MLS|EPL|UCL|UFC|MMA|PGA|GOLF|TENNIS|ATP|WTA|NASCAR|F1|ESPORTS?)\b/i.test(corpus);
}

function hasKalshiSportsFamilyTickerSignal(corpus: string) {
  return /\b(?:KX)?MVESPORTS[A-Z0-9-]*|\bSPORTSMULTIGAME[A-Z0-9-]*|\bMULTIGAMEEXTENDED\b/i.test(corpus);
}

function hasKalshiCrossCategoryTickerSignal(corpus: string) {
  return /\b(?:KX)?MVECROSSCATEGORY[A-Z0-9-]*|\bCROSSCATEGORY\b/i.test(corpus);
}

function sportsClassificationConfidence(input: {
  isSports: boolean;
  metadataSource: boolean;
  fillRawSource: boolean;
  tickerSignal: boolean;
  league: string | null;
  sport: string | null;
}) {
  if (!input.isSports) return 0;
  if (input.metadataSource && input.league) return 90;
  if (input.metadataSource) return 80;
  if (input.fillRawSource && input.league) return 84;
  if (input.fillRawSource) return 76;
  if (input.tickerSignal && input.league) return 78;
  if (input.tickerSignal) return 62;
  if (input.league) return 70;
  if (input.sport) return 55;
  return 45;
}

function detectMarketType(corpus: string, ...records: JsonRecord[]) {
  const explicit = rawTextFromRecords(records, ["market_type", "type", "market_kind"]);
  if (explicit && explicit.toLowerCase() !== "binary") return titleCase(explicit);
  if (hasKalshiSportsFamilyTickerSignal(corpus) || hasKalshiCrossCategoryTickerSignal(corpus) || /\bexotics?\b/i.test(corpus)) return "Multi-game exotic";
  if (/\b(spread|cover)\b/i.test(corpus)) return "Spread";
  if (/\b(total|over\/under|over|under|points|runs|goals)\b/i.test(corpus)) return "Total";
  if (/\b(player|yards|rebounds|assists|touchdowns|home runs|strikeouts)\b/i.test(corpus)) return "Player prop";
  if (/\b(championship|title|playoff|mvp|award|season|tournament)\b/i.test(corpus)) return "Future";
  if (/\b(win|winner|moneyline|beat|defeat)\b/i.test(corpus)) return "Moneyline";
  return "Other";
}

function detectSportsTeamAliases(values: Array<string | null | undefined>): TeamAliasMatch[] {
  const candidates = teamAliasCandidates(values.filter(Boolean).join(" "));
  const matches = new Map<string, TeamAliasMatch>();

  for (const candidate of candidates) {
    for (const row of SPORTS_TEAM_ALIASES) {
      if (!row.aliases.some((alias) => normalizeTeamAlias(alias) === candidate)) continue;
      const existing = matches.get(row.team);
      if (!existing || row.confidence > existing.confidence) {
        matches.set(row.team, {
          team: row.team,
          league: row.league,
          sport: row.sport,
          confidence: row.confidence,
        });
      }
    }
  }

  return Array.from(matches.values()).sort((left, right) => right.confidence - left.confidence);
}

function inferLeagueFromTeamAliases(matches: TeamAliasMatch[]) {
  const highConfidence = matches.find((match) => match.confidence >= 90);
  if (highConfidence) return highConfidence.league;

  const teamsByLeague = new Map<string, Set<string>>();
  for (const match of matches) {
    const teams = teamsByLeague.get(match.league) ?? new Set<string>();
    teams.add(match.team);
    teamsByLeague.set(match.league, teams);
  }

  const ranked = Array.from(teamsByLeague.entries()).sort((left, right) => right[1].size - left[1].size);
  const [leader, runnerUp] = ranked;
  if (!leader || leader[1].size < 2) return null;
  if (runnerUp && runnerUp[1].size === leader[1].size) return null;
  return leader[0];
}

function teamAliasCandidates(text: string) {
  const candidates = new Set<string>();
  const titleLikeText = text.replace(/\b(?:yes|no)\s+/gi, ", ");
  const segments = titleLikeText.split(/[,;|]|\s+vs\.?\s+|\s+v\.?\s+|\s+at\s+|\s+@\s+/i);

  for (const segment of segments) {
    const cleaned = normalizeTeamAlias(
      segment
        .replace(/\b(?:yes|no|will|the)\b/gi, " ")
        .replace(/\s+(?:game|match|team|market)$/i, " "),
    );
    if (cleaned) candidates.add(cleaned);
  }

  return candidates;
}

function normalizeTeamAlias(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractTeams(market: MarketForClassification, event: EventForClassification, teamMatches: TeamAliasMatch[], ...records: JsonRecord[]) {
  const teamKeys = [
    "home_team",
    "away_team",
    "home_team_name",
    "away_team_name",
    "team",
    "team_name",
    "opponent",
    "opponent_team",
    "participant",
    "participant_name",
    "participants",
    "competitor",
    "competitor_name",
    "competitors",
  ];
  const explicitTeams = uniqueStrings([
    ...records.flatMap((record) => rawStringValues(record, teamKeys)),
  ]).slice(0, 4);
  if (explicitTeams.length) return explicitTeams;

  const matchedTeams = uniqueStrings(teamMatches.map((match) => match.team)).slice(0, 8);
  if (matchedTeams.length) return matchedTeams;

  const title = [market.title, market.subtitle, event?.title].filter(Boolean).join(" ");
  const match = title.match(/([A-Z][A-Za-z0-9 .&'-]{2,})\s+(?:vs\.?|v\.?|at|@)\s+([A-Z][A-Za-z0-9 .&'-]{2,})/);
  if (!match) return [];
  return uniqueStrings([cleanTeamName(match[1]), cleanTeamName(match[2])]).slice(0, 2);
}

function rawStringValues(record: JsonRecord, keys: string[]) {
  const values: string[] = [];
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const visit = (value: unknown, key?: string, collectAll = false) => {
    if (collectAll && typeof value === "string" && value.trim()) {
      values.push(value.trim());
      return;
    }
    if (key && wanted.has(key.toLowerCase())) {
      if (typeof value === "string" && value.trim()) values.push(value.trim());
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry, undefined, true);
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const nested of Object.values(value)) visit(nested, undefined, true);
      }
      return;
    }
    if (collectAll && Array.isArray(value)) {
      for (const entry of value) visit(entry, undefined, true);
      return;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nested] of Object.entries(value)) visit(nested, nestedKey, collectAll);
    }
  };
  visit(record);
  return values;
}

function hasSportsMetadata(record: JsonRecord) {
  const text = flattenText(record);
  return /\b(Sports?|sport_name|competition|league|home_team|away_team|team_name|participants|competitors)\b/i.test(text);
}

function rawText(record: JsonRecord, keys: string[]) {
  const lowerKeyMap = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const value = record[key] ?? record[lowerKeyMap.get(key.toLowerCase()) ?? ""];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  }
  return null;
}

function rawTextFromRecords(records: JsonRecord[], keys: string[]) {
  for (const record of records) {
    const value = rawText(record, keys);
    if (value) return value;
  }
  return null;
}

function flattenText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (value && typeof value === "object") return Object.entries(value as JsonRecord).map(([key, entry]) => `${key} ${flattenText(entry)}`).join(" ");
  return "";
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

function fixedPointOrNull(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const parsed = parseFixedPoint(value, "");
    if (parsed) return parsed;
  }
  return null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function arrayFrom(record: JsonRecord, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
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

function dedupeBy<T>(items: T[], keyFor: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [keyFor(item), item])).values());
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function cleanTeamName(value: string) {
  return value.replace(/^(will|the)\s+/i, "").replace(/\s+(game|match|team)$/i, "").trim();
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function clampCents(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function endOfDay(date: Date, daysToAdd: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + daysToAdd);
  value.setHours(23, 59, 59, 999);
  return value;
}

function isKalshiNotFoundError(error: unknown) {
  return /Kalshi API 404/.test(error instanceof Error ? error.message : String(error));
}

function shortError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

function pushWarningOnce(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

export function decimalString(value: unknown) {
  return decimalToString(value as Parameters<typeof decimalToString>[0]) ?? "0";
}
