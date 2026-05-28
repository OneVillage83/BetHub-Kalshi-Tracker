import crypto from "node:crypto";
import { getPrisma } from "@kalshi-tracker/db";
import { KalshiRestClient, dollarsToCents, normalizeOrderStatus, normalizeOutcomeSide, parseFixedPoint } from "@kalshi-tracker/kalshi-client";
import type { Prisma } from "@prisma/client";
import { STUB_REASON_AWAITING_KALSHI } from "../env";
import type { AuthenticatedAppUser } from "../auth";
import { buildKalshiClientForAppUser, getKalshiCredentialStatus } from "./kalshi-credentials";

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
  | "database_import"
  | "complete"
  | "failed";

export type BackfillCounts = {
  balanceSnapshots: number;
  fills: number;
  historicalFills: number;
  orders: number;
  historicalOrders: number;
  positions: number;
  settlements: number;
  markets: number;
  events: number;
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
};

type NormalizedFill = {
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

type NormalizedPosition = {
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

type NormalizedOrder = {
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

type NormalizedSettlement = {
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
  complete: { stageLabel: "Backfill complete", percent: 100 },
  failed: { stageLabel: "Backfill failed", percent: 100 },
};

export async function runKalshiBackfill(appUser: AuthenticatedAppUser, options: { source?: string; kind?: string } = {}) {
  const credentialStatus = await getKalshiCredentialStatus(appUser.id);
  if (!credentialStatus.configured) {
    return createMissingCredentialsSyncRun(appUser.id);
  }

  const prisma = getPrisma();
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

  const stats: ImportStats = {
    balanceSnapshots: 0,
    fills: 0,
    historicalFills: 0,
    orders: 0,
    historicalOrders: 0,
    positions: 0,
    settlements: 0,
    markets: 0,
    events: 0,
    skippedRows: 0,
    warnings: [],
    stage: "credentials",
    stageLabel: BACKFILL_STAGE_DETAILS.credentials.stageLabel,
    percent: BACKFILL_STAGE_DETAILS.credentials.percent,
    counts: emptyBackfillCounts(),
    updatedAt: new Date().toISOString(),
  };

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
    const normalizedPositions = normalizePositionCollection(positions, stats);
    const normalizedSettlements = normalizeSettlementCollection(settlements, stats);
    const fallbackEventTickers = collectFallbackEventTickers(normalizedFills, normalizedOrders, normalizedPositions, normalizedSettlements);
    const marketTickers = Array.from(fallbackEventTickers.keys());

    stats.fills = normalizedFills.filter((fill) => fill.source === "portfolio").length;
    stats.historicalFills = normalizedFills.filter((fill) => fill.source === "historical").length;
    stats.orders = normalizedOrders.filter((order) => order.source === "portfolio").length;
    stats.historicalOrders = normalizedOrders.filter((order) => order.source === "historical").length;
    stats.positions = normalizedPositions.length;
    stats.settlements = normalizedSettlements.length;

    await updateBackfillProgress(prisma, syncRun.id, stats, "market_metadata");
    const marketsByTicker = await fetchMarketMetadata(client, marketTickers, stats.warnings);
    const eventTickers = collectEventTickers(marketsByTicker, fallbackEventTickers);
    const eventsByTicker = await fetchEventMetadata(client, Array.from(eventTickers), stats.warnings);

    await ensureEvents(eventsByTicker, eventTickers);
    stats.events = eventTickers.size;
    await ensureMarkets(marketsByTicker, fallbackEventTickers, eventsByTicker);
    stats.markets = marketTickers.length;

    await updateBackfillProgress(prisma, syncRun.id, stats, "database_import");

    await prisma.balanceSnapshot.create({
      data: {
        kalshiAccountId: account.id,
        cashBalanceCents: centsFromIntegerField(asRecord(balance), ["balance", "cash_balance"]),
        portfolioValueCents: centsFromIntegerField(asRecord(balance), ["portfolio_value"]),
        rawJson: balance as Prisma.InputJsonValue,
      },
    });
    stats.balanceSnapshots = 1;

    for (const fill of normalizedFills) {
      const market = marketsByTicker.get(fill.marketTicker);
      await prisma.fill.upsert({
        where: {
          kalshiAccountId_fillId: {
            kalshiAccountId: account.id,
            fillId: fill.fillId,
          },
        },
        create: {
          kalshiAccountId: account.id,
          fillId: fill.fillId,
          tradeId: fill.tradeId,
          orderId: fill.orderId,
          marketTicker: fill.marketTicker,
          eventTicker: fill.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(fill.marketTicker) ?? null,
          outcomeSide: fill.outcomeSide,
          action: fill.action,
          contractCount: fill.contractCount,
          priceCents: fill.priceCents,
          feeCents: fill.feeCents,
          createdTime: fill.createdTime,
          source: fill.source,
          rawJson: fill.rawJson as Prisma.InputJsonValue,
        },
        update: {
          tradeId: fill.tradeId,
          orderId: fill.orderId,
          eventTicker: fill.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(fill.marketTicker) ?? null,
          outcomeSide: fill.outcomeSide,
          action: fill.action,
          contractCount: fill.contractCount,
          priceCents: fill.priceCents,
          feeCents: fill.feeCents,
          createdTime: fill.createdTime,
          source: fill.source,
          rawJson: fill.rawJson as Prisma.InputJsonValue,
        },
      });
    }
    for (const order of normalizedOrders) {
      const market = marketsByTicker.get(order.marketTicker);
      await prisma.order.upsert({
        where: {
          kalshiAccountId_orderId: {
            kalshiAccountId: account.id,
            orderId: order.orderId,
          },
        },
        create: {
          kalshiAccountId: account.id,
          orderId: order.orderId,
          marketTicker: order.marketTicker,
          eventTicker: order.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(order.marketTicker) ?? null,
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
        },
        update: {
          eventTicker: order.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(order.marketTicker) ?? null,
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
        },
      });
    }
    for (const position of normalizedPositions) {
      const market = marketsByTicker.get(position.marketTicker);
      await prisma.position.upsert({
        where: {
          kalshiAccountId_marketTicker: {
            kalshiAccountId: account.id,
            marketTicker: position.marketTicker,
          },
        },
        create: {
          kalshiAccountId: account.id,
          marketTicker: position.marketTicker,
          eventTicker: position.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(position.marketTicker) ?? null,
          positionContracts: position.positionContracts,
          totalTraded: position.totalTraded,
          averagePriceCents: position.averagePriceCents,
          markPriceCents: position.markPriceCents,
          exposureCents: position.exposureCents,
          realizedPnlCents: position.realizedPnlCents,
          unrealizedPnlCents: position.unrealizedPnlCents,
          feesPaidCents: position.feesPaidCents,
          rawJson: position.rawJson as Prisma.InputJsonValue,
        },
        update: {
          eventTicker: position.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(position.marketTicker) ?? null,
          positionContracts: position.positionContracts,
          totalTraded: position.totalTraded,
          averagePriceCents: position.averagePriceCents,
          markPriceCents: position.markPriceCents,
          exposureCents: position.exposureCents,
          realizedPnlCents: position.realizedPnlCents,
          unrealizedPnlCents: position.unrealizedPnlCents,
          feesPaidCents: position.feesPaidCents,
          rawJson: position.rawJson as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
      });
    }
    for (const settlement of normalizedSettlements) {
      const market = marketsByTicker.get(settlement.marketTicker);
      await prisma.settlement.upsert({
        where: {
          kalshiAccountId_rawHash: {
            kalshiAccountId: account.id,
            rawHash: settlement.rawHash,
          },
        },
        create: {
          kalshiAccountId: account.id,
          marketTicker: settlement.marketTicker,
          eventTicker: settlement.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(settlement.marketTicker) ?? null,
          rawHash: settlement.rawHash,
          settledTime: settlement.settledTime,
          realizedPnlCents: settlement.realizedPnlCents,
          revenueCents: settlement.revenueCents,
          feeCents: settlement.feeCents,
          rawJson: settlement.rawJson as Prisma.InputJsonValue,
        },
        update: {
          eventTicker: settlement.eventTicker ?? market?.eventTicker ?? fallbackEventTickers.get(settlement.marketTicker) ?? null,
          settledTime: settlement.settledTime,
          realizedPnlCents: settlement.realizedPnlCents,
          revenueCents: settlement.revenueCents,
          feeCents: settlement.feeCents,
          rawJson: settlement.rawJson as Prisma.InputJsonValue,
        },
      });
    }
    await updateBackfillProgress(prisma, syncRun.id, stats, "complete");

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "success",
        completedAt: new Date(),
        lockedAt: null,
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.kalshiAccount.update({
      where: { id: account.id },
      data: {
        lastSyncAt: new Date(),
        syncCursor: { lastCompletedSyncRunId: syncRun.id, lastCompletedAt: new Date().toISOString() },
      },
    });

    return {
      data: {
        id: syncRun.id,
        status: "success",
        completedAt: new Date().toISOString(),
        message: "Kalshi backfill imported successfully.",
        stats,
      },
      meta: { source: "db" as const },
    };
  } catch (error) {
    const message = publicBackfillError(error);
    applyBackfillProgress(stats, "failed");
    await prisma.syncRun.update({
      where: { id: syncRun.id },
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

export function emptyBackfillCounts(): BackfillCounts {
  return {
    balanceSnapshots: 0,
    fills: 0,
    historicalFills: 0,
    orders: 0,
    historicalOrders: 0,
    positions: 0,
    settlements: 0,
    markets: 0,
    events: 0,
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
    settlements: stats.settlements,
    markets: stats.markets,
    events: stats.events,
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
  for (const fill of fills) fallbackEventTickers.set(fill.marketTicker, fill.eventTicker);
  for (const order of orders) fallbackEventTickers.set(order.marketTicker, order.eventTicker);
  for (const position of positions) fallbackEventTickers.set(position.marketTicker, position.eventTicker);
  for (const settlement of settlements) fallbackEventTickers.set(settlement.marketTicker, settlement.eventTicker);
  return fallbackEventTickers;
}

async function fetchMarketMetadata(client: KalshiRestClient, tickers: string[], warnings: string[]) {
  const marketsByTicker = new Map<string, MarketMetadata>();

  for (const chunk of chunks(tickers, 100)) {
    try {
      const response = await client.getMarketsByTickers(chunk);
      for (const rawMarket of arrayFrom(asRecord(response), "markets")) {
        const market = normalizeMarket(rawMarket);
        if (market) marketsByTicker.set(market.ticker, market);
      }
    } catch (error) {
      warnings.push(`market metadata: ${publicBackfillError(error)}`);
    }
  }

  return marketsByTicker;
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

function collectEventTickers(marketsByTicker: Map<string, MarketMetadata>, fallbackEventTickers: Map<string, string | null>) {
  const eventTickers = new Set<string>();
  for (const market of marketsByTicker.values()) {
    if (market.eventTicker) eventTickers.add(market.eventTicker);
  }
  for (const eventTicker of fallbackEventTickers.values()) {
    if (eventTicker) eventTickers.add(eventTicker);
  }
  return eventTickers;
}

async function fetchEventMetadata(client: KalshiRestClient, eventTickers: string[], warnings: string[]) {
  const eventsByTicker = new Map<string, EventMetadata>();

  for (const chunk of chunks(eventTickers.slice(0, 100), 10)) {
    const results = await Promise.allSettled(
      chunk.map(async (eventTicker) => {
        const response = await client.getEvent(eventTicker);
        const event = normalizeEvent(asRecord(response).event ?? response);
        if (event) eventsByTicker.set(event.ticker, event);
      }),
    );

    for (const result of results) {
      if (result.status === "rejected") warnings.push(`event metadata: ${publicBackfillError(result.reason)}`);
    }
  }

  if (eventTickers.length > 100) warnings.push(`event metadata: skipped ${eventTickers.length - 100} events after the first 100`);
  return eventsByTicker;
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

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  return {};
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

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
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
  if (message.includes("Missing Kalshi private key")) return "Kalshi private key is missing from the deployment environment.";
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}
