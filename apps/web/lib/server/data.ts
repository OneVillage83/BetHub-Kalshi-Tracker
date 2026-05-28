import { getPrisma, decimalToString } from "@kalshi-tracker/db";
import { STUB_REASON_AWAITING_KALSHI, STUB_REASON_LIVE_SYNC } from "../env";
import { getKalshiCredentialStatus } from "./kalshi-credentials";
import {
  isBackfillProgressStale,
  reconcileRecoverableBackfillRuns,
  type BackfillCounts,
  type BackfillProgress,
  type BackfillProgressStage,
} from "./backfill";

type SourceState = {
  source: "db" | "stub";
  stubReason?: string;
};

export type DashboardSummary = {
  bankrollCents: number;
  cashBalanceCents: number;
  portfolioValueCents: number;
  realizedPnlCents: number;
  openExposureCents: number;
  winRate: number;
  feesPaidCents: number;
  activePositions: number;
  equity: Array<{ date: string; valueCents: number }>;
};

export type FillRow = {
  id: string;
  fillId: string;
  createdTime: string;
  marketTicker: string;
  marketTitle: string;
  outcomeSide: string;
  action: string | null;
  contractCount: string;
  priceCents: number;
  feeCents: number;
  source: string;
};

export type PositionRow = {
  id: string;
  positionType: "event" | "market";
  marketTicker: string;
  eventTicker: string | null;
  marketTitle: string;
  category: string;
  outcomeSide: string;
  positionContracts: string;
  totalCostCents: number | null;
  averagePriceCents: number | null;
  markPriceCents: number | null;
  exposureCents: number | null;
  realizedPnlCents: number;
  unrealizedPnlCents: number | null;
  feesPaidCents: number;
};

export type SettlementRow = {
  id: string;
  marketTicker: string;
  marketTitle: string;
  settledTime: string | null;
  realizedPnlCents: number | null;
  revenueCents: number | null;
  feeCents: number | null;
};

export type CategoryPnlRow = {
  category: string;
  realizedPnlCents: number;
};

export type SyncStatus = {
  api: "healthy" | "credentials_missing";
  lastSyncAt: string | null;
  lastScheduledSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  progress: BackfillProgress | null;
  stats: BackfillCounts | null;
  timedOut: boolean;
  canResume: boolean;
  continuationRequired: boolean;
  statusMessage: string | null;
  websocket: "stubbed";
  readOnly: true;
  historicalImport: "pending" | "complete" | "stubbed";
};

async function sourceState(appUserId: string): Promise<SourceState> {
  const credentials = await getKalshiCredentialStatus(appUserId);
  if (!credentials.configured) {
    return { source: "stub", stubReason: STUB_REASON_AWAITING_KALSHI };
  }

  return { source: "db" };
}

async function accountIdsFor(appUserId: string) {
  const accounts = await getPrisma().kalshiAccount.findMany({
    where: { appUserId },
    select: { id: true },
  });
  return accounts.map((account) => account.id);
}

export async function getDashboardSummary(appUserId: string): Promise<{ data: DashboardSummary; meta: SourceState }> {
  const accountIds = await accountIdsFor(appUserId);
  const zero: DashboardSummary = {
    bankrollCents: 0,
    cashBalanceCents: 0,
    portfolioValueCents: 0,
    realizedPnlCents: 0,
    openExposureCents: 0,
    winRate: 0,
    feesPaidCents: 0,
    activePositions: 0,
    equity: [],
  };

  const meta = await sourceState(appUserId);
  if (accountIds.length === 0) return { data: zero, meta };

  const [latestBalance, balances, positions, eventPositions, settlements] = await Promise.all([
    getPrisma().balanceSnapshot.findFirst({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { capturedAt: "desc" },
    }),
    getPrisma().balanceSnapshot.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      orderBy: { capturedAt: "asc" },
      take: 90,
    }),
    getPrisma().position.findMany({
      where: { kalshiAccountId: { in: accountIds } },
    }),
    getPrisma().eventPosition.findMany({
      where: { kalshiAccountId: { in: accountIds } },
    }),
    getPrisma().settlement.findMany({
      where: { kalshiAccountId: { in: accountIds } },
    }),
  ]);

  return {
    data: buildDashboardSummary({
      latestBalance,
      balances,
      positions,
      eventPositions,
      settlements,
    }),
    meta,
  };
}

export function buildDashboardSummary(input: {
  latestBalance: { cashBalanceCents: number | null; portfolioValueCents: number | null } | null;
  balances: Array<{ capturedAt: Date; cashBalanceCents: number | null; portfolioValueCents: number | null }>;
  positions: Array<{
    positionContracts: unknown;
    realizedPnlCents: number;
    feesPaidCents: number;
  }>;
  eventPositions: Array<{
    totalCostShares: unknown;
    eventExposureCents: number | null;
    realizedPnlCents: number;
    feesPaidCents: number;
  }>;
  settlements: Array<{ realizedPnlCents: number | null }>;
}): DashboardSummary {
  const cashBalanceCents = input.latestBalance?.cashBalanceCents ?? 0;
  const portfolioValueCents = input.latestBalance?.portfolioValueCents ?? 0;
  const activeEventPositions = input.eventPositions.filter((position) => Number(position.totalCostShares) !== 0 || (position.eventExposureCents ?? 0) !== 0);
  const activeMarketPositions = input.positions.filter((position) => Number(position.positionContracts) !== 0);
  const pnlSource = activeEventPositions.length > 0 ? activeEventPositions : input.positions;
  const winningSettlements = input.settlements.filter((settlement) => (settlement.realizedPnlCents ?? 0) > 0).length;
  const settledWithPnl = input.settlements.filter((settlement) => settlement.realizedPnlCents != null).length;

  return {
    bankrollCents: cashBalanceCents + portfolioValueCents,
    cashBalanceCents,
    portfolioValueCents,
    realizedPnlCents: pnlSource.reduce((sum, position) => sum + position.realizedPnlCents, 0),
    openExposureCents: portfolioValueCents,
    winRate: settledWithPnl === 0 ? 0 : winningSettlements / settledWithPnl,
    feesPaidCents: pnlSource.reduce((sum, position) => sum + position.feesPaidCents, 0),
    activePositions: activeEventPositions.length > 0 ? activeEventPositions.length : activeMarketPositions.length,
    equity: input.balances.map((balance) => ({
      date: balance.capturedAt.toISOString(),
      valueCents: (balance.cashBalanceCents ?? 0) + (balance.portfolioValueCents ?? 0),
    })),
  };
}

export async function getFills(appUserId: string): Promise<{ data: FillRow[]; meta: SourceState }> {
  const accountIds = await accountIdsFor(appUserId);
  const meta = await sourceState(appUserId);
  if (accountIds.length === 0) return { data: [], meta };

  const fills = await getPrisma().fill.findMany({
    where: { kalshiAccountId: { in: accountIds } },
    include: { market: true },
    orderBy: { createdTime: "desc" },
    take: 200,
  });

  return {
    data: fills.map((fill) => ({
      id: fill.id,
      fillId: fill.fillId,
      createdTime: fill.createdTime.toISOString(),
      marketTicker: fill.marketTicker,
      marketTitle: fill.market.title ?? fill.marketTicker,
      outcomeSide: fill.outcomeSide,
      action: fill.action,
      contractCount: decimalToString(fill.contractCount) ?? "0",
      priceCents: fill.priceCents,
      feeCents: fill.feeCents,
      source: fill.source,
    })),
    meta,
  };
}

export async function getPositions(appUserId: string): Promise<{ data: PositionRow[]; meta: SourceState }> {
  const accountIds = await accountIdsFor(appUserId);
  const meta = await sourceState(appUserId);
  if (accountIds.length === 0) return { data: [], meta };

  const [positions, eventPositions] = await Promise.all([
    getPrisma().position.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { market: true },
      orderBy: { updatedAt: "desc" },
    }),
    getPrisma().eventPosition.findMany({
      where: { kalshiAccountId: { in: accountIds } },
      include: { event: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const eventRows: PositionRow[] = eventPositions
    .filter((position) => Number(position.totalCostShares) !== 0 || (position.eventExposureCents ?? 0) !== 0)
    .map((position) => ({
      id: position.id,
      positionType: "event",
      marketTicker: position.eventTicker,
      eventTicker: position.eventTicker,
      marketTitle: position.event.title ?? position.eventTicker,
      category: position.event.category ?? "Uncategorized",
      outcomeSide: "event",
      positionContracts: decimalToString(position.totalCostShares) ?? "0",
      totalCostCents: position.totalCostCents,
      averagePriceCents: null,
      markPriceCents: null,
      exposureCents: position.eventExposureCents,
      realizedPnlCents: position.realizedPnlCents,
      unrealizedPnlCents: null,
      feesPaidCents: position.feesPaidCents,
    }));

  if (eventRows.length > 0) {
    return {
      data: eventRows,
      meta,
    };
  }

  return {
    data: positions.map((position) => ({
      id: position.id,
      positionType: "market",
      marketTicker: position.marketTicker,
      eventTicker: position.eventTicker,
      marketTitle: position.market.title ?? position.marketTicker,
      category: position.market.category ?? "Uncategorized",
      outcomeSide: Number(position.positionContracts) >= 0 ? "yes" : "no",
      positionContracts: decimalToString(position.positionContracts) ?? "0",
      totalCostCents: null,
      averagePriceCents: position.averagePriceCents,
      markPriceCents: position.markPriceCents,
      exposureCents: position.exposureCents,
      realizedPnlCents: position.realizedPnlCents,
      unrealizedPnlCents: position.unrealizedPnlCents,
      feesPaidCents: position.feesPaidCents,
    })),
    meta,
  };
}

export async function getSettlements(appUserId: string): Promise<{ data: SettlementRow[]; meta: SourceState }> {
  const accountIds = await accountIdsFor(appUserId);
  const meta = await sourceState(appUserId);
  if (accountIds.length === 0) return { data: [], meta };

  const settlements = await getPrisma().settlement.findMany({
    where: { kalshiAccountId: { in: accountIds } },
    include: { market: true },
    orderBy: { settledTime: "desc" },
    take: 200,
  });

  return {
    data: settlements.map((settlement) => ({
      id: settlement.id,
      marketTicker: settlement.marketTicker,
      marketTitle: settlement.market.title ?? settlement.marketTicker,
      settledTime: settlement.settledTime?.toISOString() ?? null,
      realizedPnlCents: settlement.realizedPnlCents,
      revenueCents: settlement.revenueCents,
      feeCents: settlement.feeCents,
    })),
    meta,
  };
}

export async function getCategoryPnl(appUserId: string): Promise<{ data: CategoryPnlRow[]; meta: SourceState }> {
  const { data: positions, meta } = await getPositions(appUserId);
  const byCategory = new Map<string, number>();

  for (const position of positions) {
    byCategory.set(position.category, (byCategory.get(position.category) ?? 0) + position.realizedPnlCents);
  }

  return {
    data: Array.from(byCategory.entries())
      .map(([category, realizedPnlCents]) => ({ category, realizedPnlCents }))
      .sort((a, b) => b.realizedPnlCents - a.realizedPnlCents),
    meta,
  };
}

export async function getSyncStatus(appUserId: string): Promise<{ data: SyncStatus; meta: SourceState }> {
  await reconcileRecoverableBackfillRuns(appUserId);

  const latest = await getPrisma().syncRun.findFirst({
    where: { appUserId },
    orderBy: { startedAt: "desc" },
  });
  const [lastScheduledSync, lastSuccessfulSync] = await Promise.all([
    getPrisma().syncRun.findFirst({
      where: { appUserId, source: "netlify-scheduled" },
      orderBy: { startedAt: "desc" },
    }),
    getPrisma().syncRun.findFirst({
      where: { appUserId, status: "success" },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const credentials = await getKalshiCredentialStatus(appUserId);
  const progress = progressFromStats(latest?.stats);
  const timedOut = latest?.status === "running" && isBackfillProgressStale(progress?.updatedAt ?? latest.startedAt.toISOString());
  const continuationRequired = Boolean(latest?.status === "running" && hasResumableCoreContinuationCursor(latest?.cursor));
  const statusMessage = syncStatusMessage({
    status: latest?.status ?? null,
    timedOut,
    continuationRequired,
    error: latest?.errorMessage ?? null,
  });

  return {
    data: {
      api: credentials.configured ? "healthy" : "credentials_missing",
      lastSyncAt: latest?.completedAt?.toISOString() ?? latest?.startedAt?.toISOString() ?? null,
      lastScheduledSyncAt: lastScheduledSync?.completedAt?.toISOString() ?? lastScheduledSync?.startedAt.toISOString() ?? null,
      lastSuccessfulSyncAt: lastSuccessfulSync?.completedAt?.toISOString() ?? null,
      lastStatus: latest?.status ?? null,
      lastError: latest?.errorMessage ?? null,
      progress,
      stats: countsFromStats(latest?.stats),
      timedOut,
      canResume: continuationRequired,
      continuationRequired,
      statusMessage,
      websocket: "stubbed",
      readOnly: true,
      historicalImport: latest?.status === "success" ? "complete" : credentials.configured ? "pending" : "stubbed",
    },
    meta: credentials.configured ? { source: "stub", stubReason: STUB_REASON_LIVE_SYNC } : await sourceState(appUserId),
  };
}

export function syncStatusMessage(params: { status: string | null; timedOut: boolean; continuationRequired: boolean; error: string | null }) {
  if (params.timedOut) return "Backfill may have timed out; try again.";
  if (params.status === "success") return "Backfill completed.";
  if (params.status === "failed") return `Backfill failed: ${params.error ?? "Unknown error"}`;
  if (params.status === "stub") return STUB_REASON_AWAITING_KALSHI;
  if (params.status === "running" || params.continuationRequired) return "Backfill is still running...";
  return null;
}

function progressFromStats(stats: unknown): BackfillProgress | null {
  const row = asStatsRecord(stats);
  if (!row) return null;
  const stage = typeof row.stage === "string" ? row.stage : null;
  const stageLabel = typeof row.stageLabel === "string" ? row.stageLabel : null;
  const percent = typeof row.percent === "number" ? row.percent : null;
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : null;
  if (!stage || !stageLabel || percent == null || !updatedAt) return null;

  return {
    stage: stage as BackfillProgressStage,
    stageLabel,
    percent: Math.max(0, Math.min(100, percent)),
    counts: countsFromStats(stats) ?? emptyCounts(),
    warnings: Array.isArray(row.warnings) ? row.warnings.filter((warning): warning is string => typeof warning === "string") : [],
    updatedAt,
  };
}

function countsFromStats(stats: unknown): BackfillCounts | null {
  const row = asStatsRecord(stats);
  if (!row) return null;
  const counts = asStatsRecord(row.counts) ?? row;

  return {
    balanceSnapshots: numberField(counts.balanceSnapshots),
    fills: numberField(counts.fills),
    historicalFills: numberField(counts.historicalFills),
    orders: numberField(counts.orders),
    historicalOrders: numberField(counts.historicalOrders),
    positions: numberField(counts.positions),
    eventPositions: numberField(counts.eventPositions),
    settlements: numberField(counts.settlements),
    markets: numberField(counts.markets),
    events: numberField(counts.events),
    skippedRows: numberField(counts.skippedRows),
  };
}

function hasResumableCoreContinuationCursor(cursor: unknown) {
  const row = asStatsRecord(cursor);
  return row?.continuationRequired === true && row.stage !== "market_metadata";
}

function asStatsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyCounts(): BackfillCounts {
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
    skippedRows: 0,
  };
}
