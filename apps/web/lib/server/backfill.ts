import crypto from "node:crypto";
import { getPrisma } from "@kalshi-tracker/db";
import { KalshiRestClient, dollarsToCents, normalizeOrderStatus, normalizeOutcomeSide, parseFixedPoint } from "@kalshi-tracker/kalshi-client";
import { Prisma } from "@prisma/client";
import { STUB_REASON_AWAITING_KALSHI } from "../env";
import type { AuthenticatedAppUser } from "../auth";
import { buildKalshiClientForAppUser, getKalshiCredentialStatus } from "./kalshi-credentials";
import { enrichGeneralAnalytics } from "./general-analytics";
import { enrichSportsAnalytics } from "./sports-analytics";

type JsonRecord = Record<string, unknown>;

export type BackfillProgressStage =
  | "credentials"
  | "balance"
  | "fills"
  | "historical_fills"
  | "orders"
  | "historical_orders"
  | "positions"
  | "settlements"
  | "market_metadata"
  | "sports_analytics"
  | "analytics_metrics"
  | "database_import"
  | "complete"
  | "failed";

export const BACKFILL_STALE_MS = 3 * 60 * 1000;
const BACKFILL_SOFT_BUDGET_MS = 18 * 1000;
const MARKET_METADATA_CHUNK_SIZE = 20;
const EVENT_METADATA_DELAY_MS = 250;
const METADATA_RETRY_DELAYS_MS = [750, 2000, 5000];

export type BackfillCounts = {
  balanceSnapshots: number;
  fills: number;
  historicalFills: number;
  orders: number;
  historicalOrders: number;
  positions: number;
  eventPositions: number;
  settlements: number;
  markets: number;
  events: number;
  sportsMarkets: number;
  sportsFills: number;
  candlesticks: number;
  orderbookSnapshots: number;
  analyticsDailyRollups: number;
  analyticsFillMetrics: number;
  analyticsPositionMetrics: number;
  skippedRows: number;
};

export type BackfillProgress = {
  stage: BackfillProgressStage;
  stageLabel: string;
  percent: number;
  counts: BackfillCounts;
  warnings: string[];
  updatedAt: string;
};

export type ImportStats = BackfillCounts & {
  warnings: string[];
  stage: BackfillProgressStage;
  stageLabel: string;
  percent: number;
  counts: BackfillCounts;
  updatedAt: string;
  continuationRequired?: boolean;
  coreImportCompleted?: boolean;
};

export type NormalizedFill = {
  fillId: string;
  tradeId: string | null;
  orderId: string | null;
  marketTicker: string;
  eventTicker: string | null;
  outcomeSide: "yes" | "no" | "unknown";
  action: string | null;
  contractCount: string;
  priceCents: number;
  feeCents: number;
  createdTime: Date;
  source: string;
  rawJson: JsonRecord;
};

export type NormalizedPosition = {
  marketTicker: string;
  eventTicker: string | null;
  positionContracts: string;
  totalTraded: string;
  averagePriceCents: number | null;
  markPriceCents: number | null;
  exposureCents: number | null;
  realizedPnlCents: number;
  unrealizedPnlCents: number | null;
  feesPaidCents: number;
  rawJson: JsonRecord;
};

export type NormalizedEventPosition = {
  eventTicker: string;
  totalCostCents: number | null;
  totalCostShares: string;
  eventExposureCents: number | null;
  realizedPnlCents: number;
  feesPaidCents: number;
  rawJson: JsonRecord;
};

export type NormalizedOrder = {
  orderId: string;
  marketTicker: string;
  eventTicker: string | null;
  outcomeSide: "yes" | "no" | "unknown";
  action: string | null;
  status: "resting" | "executed" | "canceled" | "unknown";
  originalCount: string | null;
  remainingCount: string | null;
  filledCount: string | null;
  priceCents: number | null;
  createdTime: Date | null;
  updatedTime: Date | null;
  source: string;
  rawJson: JsonRecord;
};

export type NormalizedSettlement = {
  marketTicker: string;
  eventTicker: string | null;
  rawHash: string;
  settledTime: Date | null;
  realizedPnlCents: number | null;
  revenueCents: number | null;
  feeCents: number | null;
  rawJson: JsonRecord;
};

type MarketMetadata = {
  ticker: string;
  eventTicker: string | null;
  title: string | null;
  subtitle: string | null;
  category: string | null;
  status: string | null;
  closeTime: Date | null;
  expirationTime: Date | null;
  settlementTime: Date | null;
  yesAsk: number | null;
  yesBid: number | null;
  noAsk: number | null;
  noBid: number | null;
  lastPrice: number | null;
  volume: string | null;
  liquidity: number | null;
  rawJson: JsonRecord;
};

type EventMetadata = {
  ticker: string;
  title: string | null;
  category: string | null;
  status: string | null;
  rawJson: JsonRecord;
};

const BACKFILL_STAGE_DETAILS: Record<BackfillProgressStage, { stageLabel: string; percent: number }> = {
  credentials: { stageLabel: "Checking Kalshi credentials", percent: 5 },
  balance: { stageLabel: "Fetching balance", percent: 12 },
  fills: { stageLabel: "Fetching fills", percent: 24 },
  historical_fills: { stageLabel: "Fetching historical fills", percent: 36 },
  orders: { stageLabel: "Fetching open and recent orders", percent: 48 },
  historical_orders: { stageLabel: "Fetching historical orders", percent: 58 },
  positions: { stageLabel: "Fetching open positions", percent: 68 },
  settlements: { stageLabel: "Fetching settlements", percent: 76 },
  market_metadata: { stageLabel: "Enriching market metadata", percent: 86 },
  database_import: { stageLabel: "Saving imported data", percent: 94 },
  sports_analytics: { stageLabel: "Building sports analytics", percent: 96 },
  analytics_metrics: { stageLabel: "Building analytics metrics", percent: 98 },
  complete: { stageLabel: "Backfill complete", percent: 100 },
  failed: { stageLabel: "Backfill failed", percent: 100 },
};

type BackfillOptions = {
  source?: string;
  kind?: string;
  replaceActiveRun?: boolean;
  allowContinuation?: boolean;
  softBudgetMs?: number;
};

type BackfillCursor = {
  continuationRequired: true;
  reason: "soft_time_budget";
  stage: "market_metadata";
  marketTickers: string[];
  fallbackEventPairs: Array<[string, string | null]>;
  marketIndex: number;
  eventTickers: string[];
  eventIndex: number;
  updatedAt: string;
};

type RunningSyncRun = {
  id: string;
  appUserId: string;
  kalshiAccountId: string | null;
  stats: Prisma.JsonValue | null;
  cursor: Prisma.JsonValue | null;
  completedAt: Date | null;
};

export async function runKalshiBackfill(appUser: AuthenticatedAppUser, options: BackfillOptions = {}) {
  const credentialStatus = await getKalshiCredentialStatus(appUser.id);
  if (!credentialStatus.configured) {
    return createMissingCredentialsSyncRun(appUser.id);
  }

  const prisma = getPrisma();
  await markStaleRunningSyncRunsFailed(appUser.id);
  await reconcileRecoverableBackfillRuns(appUser.id);

  const activeRun = await prisma.syncRun.findFirst({
    where: { appUserId: appUser.id, status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (activeRun && options.kind === "backfill-continue") return continueRunningBackfill(appUser, activeRun, options);
  if (activeRun && !options.replaceActiveRun) return runningSyncRunResponse(activeRun);
  if (activeRun && options.replaceActiveRun) {
    await failRunningSyncRuns(appUser.id, "Backfill resumed in a fresh request.");
  }

  const startedAt = Date.now();
  const softBudgetMs = options.softBudgetMs ?? BACKFILL_SOFT_BUDGET_MS;
  const { client, accountId } = await buildKalshiClientForAppUser(appUser);
  const account = await prisma.kalshiAccount.findUniqueOrThrow({ where: { id: accountId } });
  const syncRun = await prisma.syncRun.create({
    data: {
      appUserId: appUser.id,
      kalshiAccountId: account.id,
      kind: options.kind ?? "backfill",
      source: options.source ?? "netlify-route",
      status: "running",
      lockedAt: new Date(),
    },
  });

  const stats = emptyImportStats("credentials");

  try {
    await updateBackfillProgress(prisma, syncRun.id, stats, "credentials");

    await updateBackfillProgress(prisma, syncRun.id, stats, "balance");
    const balance = await client.getBalance();

    await updateBackfillProgress(prisma, syncRun.id, stats, "fills");
    const fills = await client.getAllFills();

    await updateBackfillProgress(prisma, syncRun.id, stats, "historical_fills");
    const historicalFills = await readOptionalCollection("historical fills", () => client.getAllHistoricalFills(), stats.warnings);

    await updateBackfillProgress(prisma, syncRun.id, stats, "orders");
    const orders = await readOptionalCollection("orders", () => client.getAllOrders(), stats.warnings);

    await updateBackfillProgress(prisma, syncRun.id, stats, "historical_orders");
    const historicalOrders = await readOptionalCollection("historical orders", () => client.getAllHistoricalOrders(), stats.warnings);

    await updateBackfillProgress(prisma, syncRun.id, stats, "positions");
    const positions = await client.getAllPositions({ count_filter: "position,total_traded" });

    await updateBackfillProgress(prisma, syncRun.id, stats, "settlements");
    const settlements = await client.getAllSettlements();

    const normalizedFills = [
      ...normalizeFillCollection(fills, "portfolio", stats),
      ...normalizeFillCollection(historicalFills, "historical", stats),
    ];
    const normalizedOrders = [
      ...normalizeOrderCollection(orders, "portfolio", stats),
      ...normalizeOrderCollection(historicalOrders, "historical", stats),
    ];
    const normalizedPositions = normalizePositionCollection(positions.marketPositions, stats);
    const normalizedEventPositions = normalizeEventPositionCollection(positions.eventPositions, stats);
    const normalizedSettlements = normalizeSettlementCollection(settlements, stats);
    const fallbackEventTickers = collectFallbackEventTickers(normalizedFills, normalizedOrders, normalizedPositions, normalizedSettlements);

    stats.fills = normalizedFills.filter((fill) => fill.source === "portfolio").length;
    stats.historicalFills = normalizedFills.filter((fill) => fill.source === "historical").length;
    stats.orders = normalizedOrders.filter((order) => order.source === "portfolio").length;
    stats.historicalOrders = normalizedOrders.filter((order) => order.source === "historical").length;
    stats.positions = normalizedPositions.length;
    stats.eventPositions = normalizedEventPositions.length;
    stats.settlements = normalizedSettlements.length;

    await updateBackfillProgress(prisma, syncRun.id, stats, "database_import");
    const importedCounts = await importCoreBackfillData(prisma, account.id, {
      balance,
      fills: normalizedFills,
      orders: normalizedOrders,
      positions: normalizedPositions,
      eventPositions: normalizedEventPositions,
      settlements: normalizedSettlements,
      fallbackEventTickers,
    });
    stats.balanceSnapshots = importedCounts.balanceSnapshots;
    stats.fills = importedCounts.fills;
    stats.historicalFills = importedCounts.historicalFills;
    stats.orders = importedCounts.orders;
    stats.historicalOrders = importedCounts.historicalOrders;
    stats.positions = importedCounts.positions;
    stats.eventPositions = importedCounts.eventPositions;
    stats.settlements = importedCounts.settlements;
    stats.coreImportCompleted = true;
    await saveBackfillStats(prisma, syncRun.id, stats);
    await enrichOptionalMetadataBestEffort({
      prisma,
      client,
      syncRunId: syncRun.id,
      stats,
      fallbackEventTickers,
      startedAt,
      softBudgetMs,
    });
    await enrichSportsAnalyticsBestEffort({
      prisma,
      client,
      kalshiAccountId: account.id,
      syncRunId: syncRun.id,
      stats,
    });
    await enrichGeneralAnalyticsBestEffort({
      prisma,
      client,
      appUserId: appUser.id,
      kalshiAccountId: account.id,
      syncRunId: syncRun.id,
      stats,
    });
    return finishBackfillSuccess(prisma, syncRun.id, account.id, stats);
  } catch (error) {
    return failBackfillRun(prisma, syncRun.id, stats, error);
  }
}

async function continueRunningBackfill(appUser: AuthenticatedAppUser, syncRun: RunningSyncRun, options: BackfillOptions) {
  const cursor = backfillCursorFromJson(syncRun.cursor);
  if (!cursor) return runningSyncRunResponse(syncRun);

  const prisma = getPrisma();
  const startedAt = Date.now();
  const softBudgetMs = options.softBudgetMs ?? BACKFILL_SOFT_BUDGET_MS;
  const allowContinuation = options.allowContinuation ?? true;
  const { client, accountId } = await buildKalshiClientForAppUser(appUser);
  const kalshiAccountId = syncRun.kalshiAccountId ?? accountId;
  const stats = importStatsFromJson(syncRun.stats);
  stats.continuationRequired = false;
  stats.stage = "market_metadata";
  stats.stageLabel = BACKFILL_STAGE_DETAILS.market_metadata.stageLabel;

  await prisma.syncRun.update({
    where: { id: syncRun.id },
    data: {
      lockedAt: new Date(),
      errorMessage: null,
    },
  });

  try {
    const continuationCursor = await enrichOptionalMetadata({
      prisma,
      client,
      syncRunId: syncRun.id,
      stats,
      fallbackEventTickers: new Map(cursor.fallbackEventPairs),
      startedAt,
      softBudgetMs,
      allowContinuation,
      cursor,
    });
    if (continuationCursor) return createContinuationResponse(prisma, syncRun.id, stats, continuationCursor);
    return finishBackfillSuccess(prisma, syncRun.id, kalshiAccountId, stats);
  } catch (error) {
    return failBackfillRun(prisma, syncRun.id, stats, error);
  }
}

export async function markStaleRunningSyncRunsFailed(appUserId: string, now = Date.now()) {
  const prisma = getPrisma();
  const runningRuns = await prisma.syncRun.findMany({
    where: { appUserId, status: "running" },
    orderBy: { startedAt: "desc" },
  });

  for (const run of runningRuns) {
    const progress = progressRecordFromStats(run.stats);
    const updatedAt = progress?.updatedAt ?? run.startedAt.toISOString();
    if (!isBackfillProgressStale(updatedAt, now)) continue;

    const stats = {
      ...(asStatsRecord(run.stats) ?? {}),
      failure: "Backfill may have timed out; resume or try again.",
      timedOut: true,
    } as unknown as Prisma.InputJsonValue;
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(now),
        lockedAt: null,
        errorMessage: "Backfill may have timed out; resume or try again.",
        stats,
      },
    });
  }
}

export function isBackfillProgressStale(updatedAt: string | null | undefined, now = Date.now()) {
  if (!updatedAt) return true;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > BACKFILL_STALE_MS;
}

export async function reconcileRecoverableBackfillRuns(appUserId: string) {
  const prisma = getPrisma();
  const runs = await prisma.syncRun.findMany({
    where: {
      appUserId,
      status: { in: ["failed", "running"] },
      kalshiAccountId: { not: null },
    },
    orderBy: { startedAt: "desc" },
    take: 5,
  });

  for (const run of runs) {
    if (!isRecoverableCoreImportStats(run.stats)) continue;
    if (!(await hasSavedCoreImportRows(prisma, run))) continue;

    const stats = importStatsFromJson(run.stats);
    stats.coreImportCompleted = true;
    stats.continuationRequired = false;
    if (run.errorMessage) {
      pushWarningOnce(stats.warnings, `metadata warning: ${run.errorMessage}`);
    } else if (asStatsRecord(run.cursor)?.stage === "market_metadata" || stats.stage === "market_metadata") {
      pushWarningOnce(stats.warnings, "metadata enrichment did not finish after core import; marked complete.");
    }
    applyBackfillProgress(stats, "complete");

    const completedAt = run.completedAt ?? new Date();
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        completedAt,
        lockedAt: null,
        errorMessage: null,
        cursor: Prisma.JsonNull,
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });

    if (run.kalshiAccountId) {
      await prisma.kalshiAccount.update({
        where: { id: run.kalshiAccountId },
        data: {
          lastSyncAt: completedAt,
          syncCursor: { lastCompletedSyncRunId: run.id, lastCompletedAt: completedAt.toISOString() },
        },
      });
    }
  }
}

export function isRecoverableCoreImportStats(stats: unknown) {
  const row = asStatsRecord(stats);
  if (!row) return false;
  if (row.coreImportCompleted === true) return true;
  const stage = backfillStageFromValue(row.stage);
  if (stage === "database_import" || stage === "market_metadata" || stage === "complete") return true;
  const counts = countsFromStatsRecord(row);
  return numberField(row.percent) >= 94 || counts.balanceSnapshots > 0;
}

async function hasSavedCoreImportRows(
  prisma: ReturnType<typeof getPrisma>,
  run: {
    id: string;
    kalshiAccountId: string | null;
    startedAt: Date;
    stats: Prisma.JsonValue | null;
  },
) {
  if (!run.kalshiAccountId) return false;

  const counts = countsFromStatsRecord(asStatsRecord(run.stats));
  const since = run.startedAt;
  const [balanceSnapshots, fills, orders, positions, eventPositions, settlements] = await Promise.all([
    prisma.balanceSnapshot.count({ where: { kalshiAccountId: run.kalshiAccountId, capturedAt: { gte: since } } }),
    prisma.fill.count({ where: { kalshiAccountId: run.kalshiAccountId, updatedAt: { gte: since } } }),
    prisma.order.count({ where: { kalshiAccountId: run.kalshiAccountId, updatedAt: { gte: since } } }),
    prisma.position.count({ where: { kalshiAccountId: run.kalshiAccountId, syncedAt: { gte: since } } }),
    prisma.eventPosition.count({ where: { kalshiAccountId: run.kalshiAccountId, syncedAt: { gte: since } } }),
    prisma.settlement.count({ where: { kalshiAccountId: run.kalshiAccountId, updatedAt: { gte: since } } }),
  ]);

  return (
    balanceSnapshots > 0 &&
    fills >= counts.fills + counts.historicalFills &&
    orders >= counts.orders + counts.historicalOrders &&
    positions >= counts.positions &&
    eventPositions >= counts.eventPositions &&
    settlements >= counts.settlements
  );
}

async function createMissingCredentialsSyncRun(appUserId: string) {
  const stats = buildMissingCredentialsBackfillStats();
  const syncRun = await getPrisma().syncRun.create({
    data: {
      appUserId,
      kind: "backfill",
      source: "netlify-route",
      status: "stub",
      completedAt: new Date(),
      errorMessage: STUB_REASON_AWAITING_KALSHI,
      stats: {
        stubReason: STUB_REASON_AWAITING_KALSHI,
        ...stats,
      },
    },
  });

  return {
    data: {
      id: syncRun.id,
      status: syncRun.status,
      completedAt: syncRun.completedAt?.toISOString() ?? null,
      message: STUB_REASON_AWAITING_KALSHI,
      stats,
    },
    meta: { source: "stub" as const, stubReason: STUB_REASON_AWAITING_KALSHI },
  };
}

async function createContinuationResponse(prisma: ReturnType<typeof getPrisma>, syncRunId: string, stats: ImportStats, cursor: BackfillCursor) {
  stats.continuationRequired = true;
  stats.stageLabel = "Backfill is still running; continuing in another request";
  stats.updatedAt = new Date().toISOString();
  cursor.updatedAt = stats.updatedAt;
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      lockedAt: null,
      cursor: cursor as Prisma.InputJsonValue,
      stats: stats as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    data: {
      id: syncRunId,
      status: "running",
      completedAt: null,
      continuationRequired: true,
      message: "Backfill is still running...",
      stats,
    },
    meta: { source: "db" as const },
  };
}

async function finishBackfillSuccess(prisma: ReturnType<typeof getPrisma>, syncRunId: string, kalshiAccountId: string, stats: ImportStats) {
  stats.continuationRequired = false;
  await updateBackfillProgress(prisma, syncRunId, stats, "complete");

  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      status: "success",
      completedAt: new Date(),
      lockedAt: null,
      cursor: Prisma.JsonNull,
      stats: stats as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.kalshiAccount.update({
    where: { id: kalshiAccountId },
    data: {
      lastSyncAt: new Date(),
      syncCursor: { lastCompletedSyncRunId: syncRunId, lastCompletedAt: new Date().toISOString() },
    },
  });

  return {
    data: {
      id: syncRunId,
      status: "success",
      completedAt: new Date().toISOString(),
      message: "Kalshi backfill imported successfully.",
      stats,
    },
    meta: { source: "db" as const },
  };
}

async function failBackfillRun(
  prisma: ReturnType<typeof getPrisma>,
  syncRunId: string,
  stats: ImportStats,
  error: unknown,
): Promise<never> {
  const message = publicBackfillError(error);
  applyBackfillProgress(stats, "failed");
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      status: "failed",
      completedAt: new Date(),
      lockedAt: null,
      errorMessage: message,
      stats: {
        ...stats,
        failure: message,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  throw new Error(message);
}

function runningSyncRunResponse(syncRun: RunningSyncRun) {
  const stats = asStatsRecord(syncRun.stats);
  return {
    data: {
      id: syncRun.id,
      status: "running",
      completedAt: syncRun.completedAt?.toISOString() ?? null,
      continuationRequired: false,
      message: "Backfill is still running...",
      stats,
    },
    meta: { source: "db" as const },
  };
}

async function failRunningSyncRuns(appUserId: string, reason: string) {
  await getPrisma().syncRun.updateMany({
    where: { appUserId, status: "running" },
    data: {
      status: "failed",
      completedAt: new Date(),
      lockedAt: null,
      errorMessage: reason,
    },
  });
}

function emptyImportStats(stage: BackfillProgressStage): ImportStats {
  const counts = emptyBackfillCounts();
  const detail = BACKFILL_STAGE_DETAILS[stage];
  return {
    ...counts,
    warnings: [],
    stage,
    stageLabel: detail.stageLabel,
    percent: detail.percent,
    counts,
    updatedAt: new Date().toISOString(),
  };
}

function importStatsFromJson(value: unknown): ImportStats {
  const row = asStatsRecord(value);
  const counts = countsFromStatsRecord(row);
  const stage = backfillStageFromValue(row?.stage) ?? "market_metadata";
  const detail = BACKFILL_STAGE_DETAILS[stage];
  return {
    ...counts,
    warnings: Array.isArray(row?.warnings) ? row.warnings.filter((warning): warning is string => typeof warning === "string") : [],
    stage,
    stageLabel: typeof row?.stageLabel === "string" ? row.stageLabel : detail.stageLabel,
    percent: typeof row?.percent === "number" ? row.percent : detail.percent,
    counts,
    updatedAt: typeof row?.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
    continuationRequired: row?.continuationRequired === true,
    coreImportCompleted: row?.coreImportCompleted === true,
  };
}

function backfillCursorFromJson(value: unknown): BackfillCursor | null {
  const row = asStatsRecord(value);
  if (!row || row.continuationRequired !== true || row.stage !== "market_metadata") return null;
  const marketTickers = stringArray(row.marketTickers);
  const fallbackEventPairs = fallbackPairsFromValue(row.fallbackEventPairs);
  const eventTickers = stringArray(row.eventTickers);
  const marketIndex = nonNegativeInteger(row.marketIndex);
  const eventIndex = nonNegativeInteger(row.eventIndex);
  if (!marketTickers.length && !eventTickers.length) return null;

  return {
    continuationRequired: true,
    reason: "soft_time_budget",
    stage: "market_metadata",
    marketTickers,
    fallbackEventPairs,
    marketIndex,
    eventTickers,
    eventIndex,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
  };
}

export function emptyBackfillCounts(): BackfillCounts {
  return {
    balanceSnapshots: 0,
    fills: 0,
    historicalFills: 0,
    orders: 0,
    historicalOrders: 0,
    positions: 0,
    eventPositions: 0,
    settlements: 0,
    markets: 0,
    events: 0,
    sportsMarkets: 0,
    sportsFills: 0,
    candlesticks: 0,
    orderbookSnapshots: 0,
    analyticsDailyRollups: 0,
    analyticsFillMetrics: 0,
    analyticsPositionMetrics: 0,
    skippedRows: 0,
  };
}

export function buildMissingCredentialsBackfillStats(): ImportStats {
  const counts = emptyBackfillCounts();
  return {
    ...counts,
    warnings: [],
    stage: "credentials",
    stageLabel: "Kalshi credentials are required before backfill",
    percent: 0,
    counts,
    updatedAt: new Date().toISOString(),
  };
}

export function applyBackfillProgress(stats: ImportStats, stage: BackfillProgressStage): BackfillProgress {
  const detail = BACKFILL_STAGE_DETAILS[stage];
  const counts = {
    balanceSnapshots: stats.balanceSnapshots,
    fills: stats.fills,
    historicalFills: stats.historicalFills,
    orders: stats.orders,
    historicalOrders: stats.historicalOrders,
    positions: stats.positions,
    eventPositions: stats.eventPositions,
    settlements: stats.settlements,
    markets: stats.markets,
    events: stats.events,
    sportsMarkets: stats.sportsMarkets,
    sportsFills: stats.sportsFills,
    candlesticks: stats.candlesticks,
    orderbookSnapshots: stats.orderbookSnapshots,
    analyticsDailyRollups: stats.analyticsDailyRollups,
    analyticsFillMetrics: stats.analyticsFillMetrics,
    analyticsPositionMetrics: stats.analyticsPositionMetrics,
    skippedRows: stats.skippedRows,
  };
  const updatedAt = new Date().toISOString();

  stats.stage = stage;
  stats.stageLabel = detail.stageLabel;
  stats.percent = detail.percent;
  stats.counts = counts;
  stats.updatedAt = updatedAt;

  return {
    stage,
    stageLabel: detail.stageLabel,
    percent: detail.percent,
    counts,
    warnings: stats.warnings,
    updatedAt,
  };
}

async function updateBackfillProgress(prisma: ReturnType<typeof getPrisma>, syncRunId: string, stats: ImportStats, stage: BackfillProgressStage) {
  applyBackfillProgress(stats, stage);
  await saveBackfillStats(prisma, syncRunId, stats);
}

async function saveBackfillStats(prisma: ReturnType<typeof getPrisma>, syncRunId: string, stats: ImportStats) {
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      stats: stats as unknown as Prisma.InputJsonValue,
    },
  });
}

async function readOptionalCollection<T>(label: string, loader: () => Promise<T[]>, warnings: string[]) {
  try {
    return await loader();
  } catch (error) {
    warnings.push(`${label}: ${publicBackfillError(error)}`);
    return [];
  }
}

function normalizeFillCollection(rawFills: unknown[], source: string, stats: ImportStats) {
  const fills: NormalizedFill[] = [];

  for (const rawFill of rawFills) {
    const fill = normalizeFill(rawFill, source);
    if (fill) {
      fills.push(fill);
    } else {
      stats.skippedRows += 1;
    }
  }

  return fills;
}

function normalizeFill(rawFill: unknown, source: string): NormalizedFill | null {
  const row = asRecord(rawFill);
  const marketTicker = text(row, ["market_ticker", "ticker"]);
  if (!marketTicker) return null;

  const tradeId = text(row, ["trade_id"]);
  const orderId = text(row, ["order_id"]);
  const createdTime = date(row, ["created_time", "created_at", "ts_ms", "ts"]) ?? new Date();
  const fillId =
    text(row, ["fill_id", "id"]) ??
    [tradeId, orderId, marketTicker, createdTime.getTime().toString()].filter(Boolean).join(":");
  if (!fillId) return null;

  const outcomeSide = normalizeOutcomeSide(text(row, ["outcome_side", "side", "purchased_side"]));
  const priceCents =
    outcomeSide === "no"
      ? centsFromDollarFields(row, ["no_price_dollars", "price_dollars"], ["no_price", "price"]) ?? 0
      : centsFromDollarFields(row, ["yes_price_dollars", "price_dollars"], ["yes_price", "price"]) ?? 0;

  return {
    fillId,
    tradeId,
    orderId,
    marketTicker,
    eventTicker: text(row, ["event_ticker"]),
    outcomeSide,
    action: text(row, ["action"]),
    contractCount: fixedPoint(row, ["count_fp", "count", "contracts"]),
    priceCents,
    feeCents: centsFromDollarFields(row, ["fee_cost", "fee_cost_dollars", "fee_dollars"], ["fee"]) ?? 0,
    createdTime,
    source,
    rawJson: row,
  };
}

function normalizePositionCollection(rawPositions: unknown[], stats: ImportStats) {
  const positions: NormalizedPosition[] = [];

  for (const rawPosition of rawPositions) {
    const position = normalizePosition(rawPosition);
    if (position) {
      positions.push(position);
    } else {
      stats.skippedRows += 1;
    }
  }

  return positions;
}

function normalizeEventPositionCollection(rawPositions: unknown[], stats: ImportStats) {
  const positions: NormalizedEventPosition[] = [];

  for (const rawPosition of rawPositions) {
    const position = normalizeEventPosition(rawPosition);
    if (position) {
      positions.push(position);
    } else {
      stats.skippedRows += 1;
    }
  }

  return positions;
}

function normalizeOrderCollection(rawOrders: unknown[], source: string, stats: ImportStats) {
  const orders: NormalizedOrder[] = [];

  for (const rawOrder of rawOrders) {
    const order = normalizeOrder(rawOrder, source);
    if (order) {
      orders.push(order);
    } else {
      stats.skippedRows += 1;
    }
  }

  return orders;
}

function normalizeOrder(rawOrder: unknown, source: string): NormalizedOrder | null {
  const row = asRecord(rawOrder);
  const marketTicker = text(row, ["market_ticker", "ticker"]);
  const orderId = text(row, ["order_id", "id"]);
  if (!marketTicker || !orderId) return null;

  const outcomeSide = normalizeOutcomeSide(text(row, ["outcome_side", "side", "purchased_side"]));

  return {
    orderId,
    marketTicker,
    eventTicker: text(row, ["event_ticker"]),
    outcomeSide,
    action: text(row, ["action"]),
    status: normalizeOrderStatus(text(row, ["status"])),
    originalCount: fixedPointOrNull(row, ["initial_count", "initial_count_fp", "count", "count_fp"]),
    remainingCount: fixedPointOrNull(row, ["remaining_count", "remaining_count_fp"]),
    filledCount: fixedPointOrNull(row, ["filled_count", "filled_count_fp"]),
    priceCents:
      outcomeSide === "no"
        ? centsFromDollarFields(row, ["no_price_dollars", "price_dollars"], ["no_price", "price"])
        : centsFromDollarFields(row, ["yes_price_dollars", "price_dollars"], ["yes_price", "price"]),
    createdTime: date(row, ["created_time", "created_at"]),
    updatedTime: date(row, ["updated_time", "updated_at"]),
    source,
    rawJson: row,
  };
}

function normalizePosition(rawPosition: unknown): NormalizedPosition | null {
  const row = asRecord(rawPosition);
  const marketTicker = text(row, ["market_ticker", "ticker"]);
  if (!marketTicker) return null;

  return {
    marketTicker,
    eventTicker: text(row, ["event_ticker"]),
    positionContracts: fixedPoint(row, ["position_fp", "position", "position_contracts"]),
    totalTraded: fixedPoint(row, ["total_traded_fp", "total_traded", "total_traded_dollars"]),
    averagePriceCents: centsFromDollarFields(row, ["average_price_dollars", "avg_price_dollars"], ["average_price", "avg_price"]),
    markPriceCents: centsFromDollarFields(row, ["mark_price_dollars", "last_price_dollars"], ["mark_price", "last_price"]),
    exposureCents: centsFromDollarFields(row, ["market_exposure_dollars", "exposure_dollars"], ["market_exposure", "exposure"]),
    realizedPnlCents: centsFromDollarFields(row, ["realized_pnl_dollars"], ["realized_pnl"]) ?? 0,
    unrealizedPnlCents: centsFromDollarFields(row, ["unrealized_pnl_dollars"], ["unrealized_pnl"]),
    feesPaidCents: centsFromDollarFields(row, ["fees_paid_dollars"], ["fees_paid"]) ?? 0,
    rawJson: row,
  };
}

function normalizeEventPosition(rawPosition: unknown): NormalizedEventPosition | null {
  const row = asRecord(rawPosition);
  const eventTicker = text(row, ["event_ticker", "ticker"]);
  if (!eventTicker) return null;

  return {
    eventTicker,
    totalCostCents: centsFromDollarFields(row, ["total_cost_dollars"], ["total_cost"]),
    totalCostShares: fixedPoint(row, ["total_cost_shares_fp", "total_cost_shares"]),
    eventExposureCents: centsFromDollarFields(row, ["event_exposure_dollars"], ["event_exposure"]),
    realizedPnlCents: centsFromDollarFields(row, ["realized_pnl_dollars"], ["realized_pnl"]) ?? 0,
    feesPaidCents: centsFromDollarFields(row, ["fees_paid_dollars"], ["fees_paid"]) ?? 0,
    rawJson: row,
  };
}

function normalizeSettlementCollection(rawSettlements: unknown[], stats: ImportStats) {
  const settlements: NormalizedSettlement[] = [];

  for (const rawSettlement of rawSettlements) {
    const settlement = normalizeSettlement(rawSettlement);
    if (settlement) {
      settlements.push(settlement);
    } else {
      stats.skippedRows += 1;
    }
  }

  return settlements;
}

function normalizeSettlement(rawSettlement: unknown): NormalizedSettlement | null {
  const row = asRecord(rawSettlement);
  const marketTicker = text(row, ["market_ticker", "ticker"]);
  if (!marketTicker) return null;

  const revenueCents = centsFromIntegerField(row, ["revenue", "value"]);
  const feeCents = centsFromDollarFields(row, ["fee_cost", "fee_cost_dollars", "fee_dollars"], ["fee"]);
  const realizedPnlCents =
    centsFromDollarFields(row, ["realized_pnl_dollars"], ["realized_pnl"]) ??
    calculatedSettlementPnl(row, revenueCents, feeCents);

  return {
    marketTicker,
    eventTicker: text(row, ["event_ticker"]),
    rawHash: rawRowHash(row),
    settledTime: date(row, ["settled_time", "settlement_time"]),
    realizedPnlCents,
    revenueCents,
    feeCents,
    rawJson: row,
  };
}

function calculatedSettlementPnl(row: JsonRecord, revenueCents: number | null, feeCents: number | null) {
  if (revenueCents == null) return null;
  const yesCost = centsFromDollarFields(row, ["yes_total_cost_dollars"], ["yes_total_cost"]) ?? 0;
  const noCost = centsFromDollarFields(row, ["no_total_cost_dollars"], ["no_total_cost"]) ?? 0;
  return revenueCents - yesCost - noCost - (feeCents ?? 0);
}

function collectFallbackEventTickers(
  fills: NormalizedFill[],
  orders: NormalizedOrder[],
  positions: NormalizedPosition[],
  settlements: NormalizedSettlement[],
) {
  const fallbackEventTickers = new Map<string, string | null>();
  for (const fill of fills) setFallbackEventTicker(fallbackEventTickers, fill.marketTicker, fill.eventTicker);
  for (const order of orders) setFallbackEventTicker(fallbackEventTickers, order.marketTicker, order.eventTicker);
  for (const position of positions) setFallbackEventTicker(fallbackEventTickers, position.marketTicker, position.eventTicker);
  for (const settlement of settlements) setFallbackEventTicker(fallbackEventTickers, settlement.marketTicker, settlement.eventTicker);
  return fallbackEventTickers;
}

function setFallbackEventTicker(fallbackEventTickers: Map<string, string | null>, marketTicker: string, eventTicker: string | null) {
  if (!fallbackEventTickers.has(marketTicker) || eventTicker) {
    fallbackEventTickers.set(marketTicker, eventTicker);
  }
}

type CoreBackfillImportInput = {
  balance: unknown;
  fills: NormalizedFill[];
  orders: NormalizedOrder[];
  positions: NormalizedPosition[];
  eventPositions: NormalizedEventPosition[];
  settlements: NormalizedSettlement[];
  fallbackEventTickers: Map<string, string | null>;
};

type CoreBackfillImportPayload = {
  balanceSnapshot: Prisma.BalanceSnapshotCreateInput;
  events: Prisma.EventCreateManyInput[];
  markets: Prisma.MarketCreateManyInput[];
  fills: Prisma.FillCreateManyInput[];
  orders: Prisma.OrderCreateManyInput[];
  positions: Prisma.PositionCreateManyInput[];
  eventPositions: Prisma.EventPositionCreateManyInput[];
  settlements: Prisma.SettlementCreateManyInput[];
};

async function importCoreBackfillData(prisma: ReturnType<typeof getPrisma>, kalshiAccountId: string, input: CoreBackfillImportInput) {
  const payload = buildCoreBackfillImportPayload(kalshiAccountId, input);
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  if (payload.events.length) operations.push(prisma.event.createMany({ data: payload.events, skipDuplicates: true }));
  if (payload.markets.length) operations.push(prisma.market.createMany({ data: payload.markets, skipDuplicates: true }));
  operations.push(
    prisma.balanceSnapshot.create({ data: payload.balanceSnapshot }),
    prisma.fill.deleteMany({ where: { kalshiAccountId } }),
    prisma.order.deleteMany({ where: { kalshiAccountId } }),
    prisma.position.deleteMany({ where: { kalshiAccountId } }),
    prisma.eventPosition.deleteMany({ where: { kalshiAccountId } }),
    prisma.settlement.deleteMany({ where: { kalshiAccountId } }),
  );

  if (payload.fills.length) operations.push(prisma.fill.createMany({ data: payload.fills }));
  if (payload.orders.length) operations.push(prisma.order.createMany({ data: payload.orders }));
  if (payload.positions.length) operations.push(prisma.position.createMany({ data: payload.positions }));
  if (payload.eventPositions.length) operations.push(prisma.eventPosition.createMany({ data: payload.eventPositions }));
  if (payload.settlements.length) operations.push(prisma.settlement.createMany({ data: payload.settlements }));

  await prisma.$transaction(operations, { timeout: 20_000 });

  return {
    balanceSnapshots: 1,
    fills: payload.fills.filter((fill) => fill.source === "portfolio").length,
    historicalFills: payload.fills.filter((fill) => fill.source === "historical").length,
    orders: payload.orders.filter((order) => order.source === "portfolio").length,
    historicalOrders: payload.orders.filter((order) => order.source === "historical").length,
    positions: payload.positions.length,
    eventPositions: payload.eventPositions.length,
    settlements: payload.settlements.length,
  };
}

export function buildCoreBackfillImportPayload(kalshiAccountId: string, input: CoreBackfillImportInput): CoreBackfillImportPayload {
  const now = new Date();
  const balanceRecord = asRecord(input.balance);
  const eventTickers = new Set([
    ...Array.from(input.fallbackEventTickers.values()).filter((ticker): ticker is string => Boolean(ticker)),
    ...input.eventPositions.map((position) => position.eventTicker),
  ]);

  const events = Array.from(eventTickers).map((ticker) => ({
    ticker,
    rawJson: { source: "kalshi-backfill-placeholder", ticker } as Prisma.InputJsonValue,
  }));
  const markets = Array.from(input.fallbackEventTickers.entries()).map(([ticker, eventTicker]) => ({
    ticker,
    eventTicker,
    rawJson: { source: "kalshi-backfill-placeholder", ticker } as Prisma.InputJsonValue,
  }));
  const fills = dedupeBy(input.fills, (fill) => fill.fillId).map((fill) => ({
    kalshiAccountId,
    fillId: fill.fillId,
    tradeId: fill.tradeId,
    orderId: fill.orderId,
    marketTicker: fill.marketTicker,
    eventTicker: fill.eventTicker ?? input.fallbackEventTickers.get(fill.marketTicker) ?? null,
    outcomeSide: fill.outcomeSide,
    action: fill.action,
    contractCount: fill.contractCount,
    priceCents: fill.priceCents,
    feeCents: fill.feeCents,
    createdTime: fill.createdTime,
    source: fill.source,
    rawJson: fill.rawJson as Prisma.InputJsonValue,
  }));
  const orders = dedupeBy(input.orders, (order) => order.orderId).map((order) => ({
    kalshiAccountId,
    orderId: order.orderId,
    marketTicker: order.marketTicker,
    eventTicker: order.eventTicker ?? input.fallbackEventTickers.get(order.marketTicker) ?? null,
    outcomeSide: order.outcomeSide,
    action: order.action,
    status: order.status,
    originalCount: order.originalCount,
    remainingCount: order.remainingCount,
    filledCount: order.filledCount,
    priceCents: order.priceCents,
    createdTime: order.createdTime,
    updatedTime: order.updatedTime,
    source: order.source,
    rawJson: order.rawJson as Prisma.InputJsonValue,
  }));
  const positions = dedupeBy(input.positions, (position) => position.marketTicker).map((position) => ({
    kalshiAccountId,
    marketTicker: position.marketTicker,
    eventTicker: position.eventTicker ?? input.fallbackEventTickers.get(position.marketTicker) ?? null,
    positionContracts: position.positionContracts,
    totalTraded: position.totalTraded,
    averagePriceCents: position.averagePriceCents,
    markPriceCents: position.markPriceCents,
    exposureCents: position.exposureCents,
    realizedPnlCents: position.realizedPnlCents,
    unrealizedPnlCents: position.unrealizedPnlCents,
    feesPaidCents: position.feesPaidCents,
    rawJson: position.rawJson as Prisma.InputJsonValue,
    syncedAt: now,
  }));
  const eventPositions = dedupeBy(input.eventPositions, (position) => position.eventTicker).map((position) => ({
    kalshiAccountId,
    eventTicker: position.eventTicker,
    totalCostCents: position.totalCostCents,
    totalCostShares: position.totalCostShares,
    eventExposureCents: position.eventExposureCents,
    realizedPnlCents: position.realizedPnlCents,
    feesPaidCents: position.feesPaidCents,
    rawJson: position.rawJson as Prisma.InputJsonValue,
    syncedAt: now,
  }));
  const settlements = dedupeBy(input.settlements, (settlement) => settlement.rawHash).map((settlement) => ({
    kalshiAccountId,
    marketTicker: settlement.marketTicker,
    eventTicker: settlement.eventTicker ?? input.fallbackEventTickers.get(settlement.marketTicker) ?? null,
    rawHash: settlement.rawHash,
    settledTime: settlement.settledTime,
    realizedPnlCents: settlement.realizedPnlCents,
    revenueCents: settlement.revenueCents,
    feeCents: settlement.feeCents,
    rawJson: settlement.rawJson as Prisma.InputJsonValue,
  }));

  return {
    balanceSnapshot: {
      account: { connect: { id: kalshiAccountId } },
      cashBalanceCents: balanceCashCents(balanceRecord),
      portfolioValueCents: balancePortfolioValueCents(balanceRecord),
      rawJson: input.balance as Prisma.InputJsonValue,
    },
    events,
    markets,
    fills,
    orders,
    positions,
    eventPositions,
    settlements,
  };
}

async function enrichOptionalMetadataBestEffort(args: {
  prisma: ReturnType<typeof getPrisma>;
  client: KalshiRestClient;
  syncRunId: string;
  stats: ImportStats;
  fallbackEventTickers: Map<string, string | null>;
  startedAt: number;
  softBudgetMs: number;
}) {
  try {
    await enrichOptionalMetadata({
      ...args,
      allowContinuation: false,
    });
  } catch (error) {
    pushWarningOnce(args.stats.warnings, `metadata enrichment: ${publicBackfillError(error)}`);
    await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
  }
}

async function enrichSportsAnalyticsBestEffort(args: {
  prisma: ReturnType<typeof getPrisma>;
  client: KalshiRestClient;
  kalshiAccountId: string;
  syncRunId: string;
  stats: ImportStats;
}) {
  try {
    await updateBackfillProgress(args.prisma, args.syncRunId, args.stats, "sports_analytics");
    const result = await enrichSportsAnalytics({
      prisma: args.prisma,
      client: args.client,
      kalshiAccountId: args.kalshiAccountId,
    });
    args.stats.sportsMarkets = result.sportsMarkets;
    args.stats.sportsFills = result.sportsFills;
    args.stats.candlesticks = result.candlesticks;
    args.stats.orderbookSnapshots = result.orderbookSnapshots;
    for (const warning of result.warnings) pushWarningOnce(args.stats.warnings, warning);
    await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
  } catch (error) {
    pushWarningOnce(args.stats.warnings, `sports analytics: ${publicBackfillError(error)}`);
    await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
  }
}

async function enrichGeneralAnalyticsBestEffort(args: {
  prisma: ReturnType<typeof getPrisma>;
  client: KalshiRestClient;
  appUserId: string;
  kalshiAccountId: string;
  syncRunId: string;
  stats: ImportStats;
}) {
  try {
    await updateBackfillProgress(args.prisma, args.syncRunId, args.stats, "analytics_metrics");
    const result = await enrichGeneralAnalytics({
      prisma: args.prisma,
      client: args.client,
      appUserId: args.appUserId,
      kalshiAccountId: args.kalshiAccountId,
    });
    args.stats.analyticsDailyRollups = result.analyticsDailyRollups;
    args.stats.analyticsFillMetrics = result.analyticsFillMetrics;
    args.stats.analyticsPositionMetrics = result.analyticsPositionMetrics;
    args.stats.candlesticks += result.candlesticks;
    args.stats.orderbookSnapshots += result.orderbookSnapshots;
    for (const warning of result.warnings) pushWarningOnce(args.stats.warnings, warning);
    await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
  } catch (error) {
    pushWarningOnce(args.stats.warnings, `analytics metrics: ${publicBackfillError(error)}`);
    await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
  }
}

async function enrichOptionalMetadata(args: {
  prisma: ReturnType<typeof getPrisma>;
  client: KalshiRestClient;
  syncRunId: string;
  stats: ImportStats;
  fallbackEventTickers: Map<string, string | null>;
  startedAt: number;
  softBudgetMs: number;
  allowContinuation: boolean;
  cursor?: BackfillCursor;
}) {
  const marketTickers = args.cursor?.marketTickers ?? Array.from(args.fallbackEventTickers.keys());
  const fallbackEventPairs = args.cursor?.fallbackEventPairs ?? Array.from(args.fallbackEventTickers.entries());
  const eventTickerSet = new Set(args.cursor?.eventTickers ?? Array.from(args.fallbackEventTickers.values()).filter((ticker): ticker is string => Boolean(ticker)));
  let marketIndex = args.cursor?.marketIndex ?? 0;
  let eventIndex = args.cursor?.eventIndex ?? 0;

  await updateBackfillProgress(args.prisma, args.syncRunId, args.stats, "market_metadata");

  while (marketIndex < marketTickers.length) {
    if (shouldPauseForContinuation(args.startedAt, args.softBudgetMs)) {
      pushWarningOnce(args.stats.warnings, "market metadata: paused before the Netlify function time limit");
      if (!args.allowContinuation) return null;
      return buildBackfillCursor(marketTickers, fallbackEventPairs, marketIndex, Array.from(eventTickerSet).slice(0, 100), eventIndex);
    }

    const chunk = marketTickers.slice(marketIndex, marketIndex + MARKET_METADATA_CHUNK_SIZE);
    const result = await fetchOptionalMarketMetadata(args.client, chunk);
    if (result.status === "rate_limited") {
      pushWarningOnce(args.stats.warnings, "Kalshi rate-limited optional market metadata; core import continues.");
      await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
      return null;
    }
    if (result.status !== "ok") {
      pushWarningOnce(args.stats.warnings, `market metadata: ${result.message}`);
    } else {
      const marketsByTicker = new Map<string, MarketMetadata>();
      const chunkEventTickers = new Set<string>();
      for (const rawMarket of arrayFrom(asRecord(result.value), "markets")) {
        const market = normalizeMarket(rawMarket);
        if (!market) continue;
        marketsByTicker.set(market.ticker, market);
        if (market.eventTicker) {
          eventTickerSet.add(market.eventTicker);
          chunkEventTickers.add(market.eventTicker);
        }
      }
      await ensureEvents(new Map(), chunkEventTickers);
      await ensureMarkets(marketsByTicker, subsetFallbackEventTickers(args.fallbackEventTickers, chunk), new Map());
    }

    marketIndex = Math.min(marketTickers.length, marketIndex + chunk.length);
    args.stats.markets = marketIndex;
    applyBackfillProgress(args.stats, "market_metadata");
    args.stats.percent = marketTickers.length > 0 ? Math.min(92, 86 + Math.round((marketIndex / marketTickers.length) * 6)) : args.stats.percent;
    await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
  }

  const cappedEventTickers = Array.from(eventTickerSet).slice(0, 100);
  if (eventTickerSet.size > 100) pushWarningOnce(args.stats.warnings, `event metadata: skipped ${eventTickerSet.size - 100} events after the first 100`);
  if (args.cursor?.eventTickers?.length) eventIndex = Math.min(eventIndex, args.cursor.eventTickers.length);

  while (eventIndex < cappedEventTickers.length) {
    if (shouldPauseForContinuation(args.startedAt, args.softBudgetMs)) {
      pushWarningOnce(args.stats.warnings, "event metadata: paused before the Netlify function time limit");
      if (!args.allowContinuation) return null;
      return buildBackfillCursor(marketTickers, fallbackEventPairs, marketIndex, cappedEventTickers, eventIndex);
    }

    const eventTicker = cappedEventTickers[eventIndex];
    const result = await fetchOptionalEventMetadata(args.client, eventTicker);
    if (result.status === "rate_limited") {
      pushWarningOnce(args.stats.warnings, "Kalshi rate-limited optional event metadata; core import continues.");
      await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
      return null;
    }
    if (result.status === "ok" && result.value) {
      await ensureEvents(new Map([[result.value.ticker, result.value]]), new Set([result.value.ticker]));
    } else if (result.status !== "ok") {
      pushWarningOnce(args.stats.warnings, `event metadata: ${result.message}`);
    }

    eventIndex += 1;
    args.stats.events = eventIndex;
    applyBackfillProgress(args.stats, "market_metadata");
    args.stats.percent = cappedEventTickers.length > 0 ? Math.min(93, 92 + Math.round((eventIndex / cappedEventTickers.length) * 1)) : args.stats.percent;
    await saveBackfillStats(args.prisma, args.syncRunId, args.stats);
    if (eventIndex < cappedEventTickers.length) await sleep(EVENT_METADATA_DELAY_MS);
  }

  return null;
}

function normalizeMarket(rawMarket: unknown): MarketMetadata | null {
  const row = asRecord(rawMarket);
  const ticker = text(row, ["ticker", "market_ticker"]);
  if (!ticker) return null;

  return {
    ticker,
    eventTicker: text(row, ["event_ticker"]),
    title: text(row, ["title"]),
    subtitle: text(row, ["subtitle", "sub_title", "yes_sub_title"]),
    category: text(row, ["category"]),
    status: text(row, ["status"]),
    closeTime: date(row, ["close_time"]),
    expirationTime: date(row, ["expiration_time", "expected_expiration_time", "latest_expiration_time"]),
    settlementTime: date(row, ["settlement_time"]),
    yesAsk: centsFromDollarFields(row, ["yes_ask_dollars"], ["yes_ask"]),
    yesBid: centsFromDollarFields(row, ["yes_bid_dollars"], ["yes_bid"]),
    noAsk: centsFromDollarFields(row, ["no_ask_dollars"], ["no_ask"]),
    noBid: centsFromDollarFields(row, ["no_bid_dollars"], ["no_bid"]),
    lastPrice: centsFromDollarFields(row, ["last_price_dollars"], ["last_price"]),
    volume: fixedPointOrNull(row, ["volume_fp", "volume"]),
    liquidity: centsFromDollarFields(row, ["liquidity_dollars"], ["liquidity"]),
    rawJson: row,
  };
}

type OptionalMetadataResult<T> =
  | { status: "ok"; value: T }
  | { status: "rate_limited"; message: string }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

async function fetchOptionalMarketMetadata(
  client: Pick<KalshiRestClient, "getMarketsByTickers">,
  tickers: string[],
  retryDelaysMs = METADATA_RETRY_DELAYS_MS,
): Promise<OptionalMetadataResult<unknown>> {
  return readOptionalKalshiMetadata(() => client.getMarketsByTickers(tickers), retryDelaysMs);
}

export async function fetchOptionalEventMetadata(
  client: Pick<KalshiRestClient, "getEvent">,
  eventTicker: string,
  retryDelaysMs = METADATA_RETRY_DELAYS_MS,
): Promise<OptionalMetadataResult<EventMetadata | null>> {
  const result = await readOptionalKalshiMetadata(() => client.getEvent(eventTicker), retryDelaysMs);
  if (result.status !== "ok") return result;
  return { status: "ok", value: normalizeEvent(asRecord(asRecord(result.value).event ?? result.value)) };
}

async function readOptionalKalshiMetadata<T>(loader: () => Promise<T>, retryDelaysMs: number[]): Promise<OptionalMetadataResult<T>> {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return { status: "ok", value: await loader() };
    } catch (error) {
      if (isKalshiRateLimitError(error) && attempt < retryDelaysMs.length) {
        await sleep(retryDelaysMs[attempt]);
        continue;
      }
      if (isKalshiRateLimitError(error)) return { status: "rate_limited", message: "Kalshi rate-limited optional metadata; core import continues." };
      if (isKalshiNotFoundError(error)) return { status: "not_found", message: publicBackfillError(error) };
      return { status: "error", message: publicBackfillError(error) };
    }
  }

  return { status: "error", message: "Unknown optional metadata error." };
}

function normalizeEvent(rawEvent: unknown): EventMetadata | null {
  const row = asRecord(rawEvent);
  const ticker = text(row, ["event_ticker", "ticker"]);
  if (!ticker) return null;

  return {
    ticker,
    title: text(row, ["title", "sub_title"]),
    category: text(row, ["category"]),
    status: text(row, ["status"]),
    rawJson: row,
  };
}

async function ensureEvents(eventsByTicker: Map<string, EventMetadata>, eventTickers: Set<string>) {
  const prisma = getPrisma();

  for (const ticker of eventTickers) {
    const event = eventsByTicker.get(ticker);
    await prisma.event.upsert({
      where: { ticker },
      create: {
        ticker,
        title: event?.title,
        category: event?.category,
        status: event?.status,
        rawJson: (event?.rawJson ?? { source: "kalshi-backfill-placeholder", ticker }) as Prisma.InputJsonValue,
      },
      update: {
        title: event?.title ?? undefined,
        category: event?.category ?? undefined,
        status: event?.status ?? undefined,
        rawJson: event?.rawJson as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

async function ensureMarkets(
  marketsByTicker: Map<string, MarketMetadata>,
  fallbackEventTickers: Map<string, string | null>,
  eventsByTicker: Map<string, EventMetadata>,
) {
  const prisma = getPrisma();

  for (const [ticker, fallbackEventTicker] of fallbackEventTickers) {
    const market = marketsByTicker.get(ticker);
    const eventTicker = market?.eventTicker ?? fallbackEventTicker ?? null;
    const event = eventTicker ? eventsByTicker.get(eventTicker) : null;
    await prisma.market.upsert({
      where: { ticker },
      create: {
        ticker,
        eventTicker,
        title: market?.title,
        subtitle: market?.subtitle,
        category: market?.category ?? event?.category,
        status: market?.status,
        closeTime: market?.closeTime,
        expirationTime: market?.expirationTime,
        settlementTime: market?.settlementTime,
        yesAsk: market?.yesAsk,
        yesBid: market?.yesBid,
        noAsk: market?.noAsk,
        noBid: market?.noBid,
        lastPrice: market?.lastPrice,
        volume: market?.volume,
        liquidity: market?.liquidity,
        rawJson: (market?.rawJson ?? { source: "kalshi-backfill-placeholder", ticker }) as Prisma.InputJsonValue,
      },
      update: {
        eventTicker,
        title: market?.title ?? undefined,
        subtitle: market?.subtitle ?? undefined,
        category: market?.category ?? event?.category ?? undefined,
        status: market?.status ?? undefined,
        closeTime: market?.closeTime ?? undefined,
        expirationTime: market?.expirationTime ?? undefined,
        settlementTime: market?.settlementTime ?? undefined,
        yesAsk: market?.yesAsk ?? undefined,
        yesBid: market?.yesBid ?? undefined,
        noAsk: market?.noAsk ?? undefined,
        noBid: market?.noBid ?? undefined,
        lastPrice: market?.lastPrice ?? undefined,
        volume: market?.volume ?? undefined,
        liquidity: market?.liquidity ?? undefined,
        rawJson: market?.rawJson as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

function subsetFallbackEventTickers(fallbackEventTickers: Map<string, string | null>, marketTickers: string[]) {
  const subset = new Map<string, string | null>();
  for (const ticker of marketTickers) subset.set(ticker, fallbackEventTickers.get(ticker) ?? null);
  return subset;
}

function shouldPauseForContinuation(startedAt: number, softBudgetMs: number) {
  return Date.now() - startedAt > softBudgetMs;
}

function buildBackfillCursor(
  marketTickers: string[],
  fallbackEventPairs: Array<[string, string | null]>,
  marketIndex: number,
  eventTickers: string[],
  eventIndex: number,
): BackfillCursor {
  return {
    continuationRequired: true,
    reason: "soft_time_budget",
    stage: "market_metadata",
    marketTickers,
    fallbackEventPairs,
    marketIndex,
    eventTickers,
    eventIndex,
    updatedAt: new Date().toISOString(),
  };
}

function pushWarningOnce(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  return {};
}

function asStatsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function progressRecordFromStats(stats: unknown) {
  const row = asStatsRecord(stats);
  if (!row) return null;
  return {
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
  };
}

function arrayFrom(record: JsonRecord, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function text(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  }
  return null;
}

function date(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const parsed = parseKalshiDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function parseKalshiDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) return parseKalshiDate(numeric);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function fixedPoint(record: JsonRecord, keys: string[]) {
  return fixedPointOrNull(record, keys) ?? "0";
}

function fixedPointOrNull(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const parsed = parseFixedPoint(value, "");
    if (parsed) return parsed;
  }
  return null;
}

function centsFromIntegerField(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.round(Number(value));
  }
  return null;
}

function centsFromDollarFields(record: JsonRecord, dollarKeys: string[], integerCentKeys: string[] = []) {
  for (const key of dollarKeys) {
    const value = record[key];
    if (value != null && value !== "") return dollarsToCents(value);
  }
  return centsFromIntegerField(record, integerCentKeys);
}

function balanceCashCents(record: JsonRecord) {
  return centsFromIntegerField(record, ["balance", "cash_balance"]) ?? centsFromDollarFields(record, ["balance_dollars", "cash_balance_dollars"]);
}

function balancePortfolioValueCents(record: JsonRecord) {
  return centsFromIntegerField(record, ["portfolio_value"]) ?? centsFromDollarFields(record, ["portfolio_value_dollars"]);
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [keyFor(item), item])).values());
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function countsFromStatsRecord(row: Record<string, unknown> | null): BackfillCounts {
  const counts = asStatsRecord(row?.counts) ?? row;
  return {
    balanceSnapshots: numberField(counts?.balanceSnapshots),
    fills: numberField(counts?.fills),
    historicalFills: numberField(counts?.historicalFills),
    orders: numberField(counts?.orders),
    historicalOrders: numberField(counts?.historicalOrders),
    positions: numberField(counts?.positions),
    eventPositions: numberField(counts?.eventPositions),
    settlements: numberField(counts?.settlements),
    markets: numberField(counts?.markets),
    events: numberField(counts?.events),
    sportsMarkets: numberField(counts?.sportsMarkets),
    sportsFills: numberField(counts?.sportsFills),
    candlesticks: numberField(counts?.candlesticks),
    orderbookSnapshots: numberField(counts?.orderbookSnapshots),
    analyticsDailyRollups: numberField(counts?.analyticsDailyRollups),
    analyticsFillMetrics: numberField(counts?.analyticsFillMetrics),
    analyticsPositionMetrics: numberField(counts?.analyticsPositionMetrics),
    skippedRows: numberField(counts?.skippedRows),
  };
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function fallbackPairsFromValue(value: unknown): Array<[string, string | null]> {
  if (!Array.isArray(value)) return [];
  const pairs: Array<[string, string | null]> = [];
  for (const item of value) {
    if (!Array.isArray(item)) continue;
    const [marketTicker, eventTicker] = item;
    if (typeof marketTicker !== "string" || !marketTicker.trim()) continue;
    pairs.push([marketTicker, typeof eventTicker === "string" && eventTicker.trim() ? eventTicker : null]);
  }
  return pairs;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function backfillStageFromValue(value: unknown): BackfillProgressStage | null {
  return typeof value === "string" && value in BACKFILL_STAGE_DETAILS ? (value as BackfillProgressStage) : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isKalshiRateLimitError(error: unknown) {
  return kalshiStatusCode(error) === 429;
}

function isKalshiNotFoundError(error: unknown) {
  return kalshiStatusCode(error) === 404;
}

function kalshiStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Kalshi API (\d{3})/);
  return match ? Number(match[1]) : null;
}

function rawRowHash(row: JsonRecord) {
  return crypto.createHash("sha256").update(stableJson(row)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function publicBackfillError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Kalshi import error.";
  if (message.includes("Kalshi API 401")) return "Kalshi rejected the configured API credentials.";
  if (message.includes("Kalshi API 403")) return "Kalshi credentials do not have access to this Kalshi resource.";
  if (message.includes("Kalshi API 404")) return "Kalshi endpoint or market metadata was not found.";
  if (message.includes("Kalshi API 429")) return "Kalshi rate-limited optional metadata; core import continues.";
  if (message.includes("Missing Kalshi private key")) return "Kalshi private key is missing from the deployment environment.";
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}
