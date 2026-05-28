import { getPrisma, decimalToString } from "@kalshi-tracker/db";
import { STUB_REASON_AWAITING_KALSHI, STUB_REASON_LIVE_SYNC } from "../env";
import { getKalshiCredentialStatus } from "./kalshi-credentials";
import type { BackfillCounts, BackfillProgress, BackfillProgressStage } from "./backfill";

type SourceState = {
  source: "db" | "stub";
  stubReason?: string;
};

export type DashboardSummary = {
  bankrollCents: number;
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
  marketTicker: string;
  marketTitle: string;
  category: string;
  outcomeSide: string;
  positionContracts: string;
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
    realizedPnlCents: 0,
    openExposureCents: 0,
    winRate: 0,
    feesPaidCents: 0,
    activePositions: 0,
    equity: [],
  };

  const meta = await sourceState(appUserId);
  if (accountIds.length === 0) return { data: zero, meta };

  const [latestBalance, balances, positions, settlements] = await Promise.all([
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
    getPrisma().settlement.findMany({
      where: { kalshiAccountId: { in: accountIds } },
    }),
  ]);

  const bankrollCents = (latestBalance?.cashBalanceCents ?? 0) + (latestBalance?.portfolioValueCents ?? 0);
  const winningSettlements = settlements.filter((settlement) => (settlement.realizedPnlCents ?? 0) > 0).length;
  const settledWithPnl = settlements.filter((settlement) => settlement.realizedPnlCents != null).length;

  return {
    data: {
      bankrollCents,
      realizedPnlCents: positions.reduce((sum, position) => sum + position.realizedPnlCents, 0),
      openExposureCents: positions.reduce((sum, position) => sum + (position.exposureCents ?? 0), 0),
      winRate: settledWithPnl === 0 ? 0 : winningSettlements / settledWithPnl,
      feesPaidCents: positions.reduce((sum, position) => sum + position.feesPaidCents, 0),
      activePositions: positions.filter((position) => Number(position.positionContracts) !== 0).length,
      equity: balances.map((balance) => ({
        date: balance.capturedAt.toISOString(),
        valueCents: (balance.cashBalanceCents ?? 0) + (balance.portfolioValueCents ?? 0),
      })),
    },
    meta,
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

  const positions = await getPrisma().position.findMany({
    where: { kalshiAccountId: { in: accountIds } },
    include: { market: true },
    orderBy: { updatedAt: "desc" },
  });

  return {
    data: positions.map((position) => ({
      id: position.id,
      marketTicker: position.marketTicker,
      marketTitle: position.market.title ?? position.marketTicker,
      category: position.market.category ?? "Uncategorized",
      outcomeSide: Number(position.positionContracts) >= 0 ? "yes" : "no",
      positionContracts: decimalToString(position.positionContracts) ?? "0",
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

  return {
    data: {
      api: credentials.configured ? "healthy" : "credentials_missing",
      lastSyncAt: latest?.completedAt?.toISOString() ?? latest?.startedAt?.toISOString() ?? null,
      lastScheduledSyncAt: lastScheduledSync?.completedAt?.toISOString() ?? lastScheduledSync?.startedAt.toISOString() ?? null,
      lastSuccessfulSyncAt: lastSuccessfulSync?.completedAt?.toISOString() ?? null,
      lastStatus: latest?.status ?? null,
      lastError: latest?.errorMessage ?? null,
      progress: progressFromStats(latest?.stats),
      stats: countsFromStats(latest?.stats),
      websocket: "stubbed",
      readOnly: true,
      historicalImport: latest?.status === "success" ? "complete" : credentials.configured ? "pending" : "stubbed",
    },
    meta: credentials.configured ? { source: "stub", stubReason: STUB_REASON_LIVE_SYNC } : await sourceState(appUserId),
  };
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
    settlements: numberField(counts.settlements),
    markets: numberField(counts.markets),
    events: numberField(counts.events),
    skippedRows: numberField(counts.skippedRows),
  };
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
    settlements: 0,
    markets: 0,
    events: 0,
    skippedRows: 0,
  };
}
