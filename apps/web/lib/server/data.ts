import { getOrCreatePrimaryAccount, getPrisma, decimalToString } from "@kalshi-tracker/db";
import { hasKalshiCredentials, kalshiEnvironment, keyIdHint, STUB_REASON_AWAITING_KALSHI, STUB_REASON_LIVE_SYNC } from "../env";

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
  lastStatus: string | null;
  lastError: string | null;
  websocket: "stubbed";
  readOnly: true;
  historicalImport: "pending" | "complete" | "stubbed";
};

function sourceState(): SourceState {
  if (!hasKalshiCredentials()) {
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

  if (accountIds.length === 0) return { data: zero, meta: sourceState() };

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
    meta: sourceState(),
  };
}

export async function getFills(appUserId: string): Promise<{ data: FillRow[]; meta: SourceState }> {
  const accountIds = await accountIdsFor(appUserId);
  if (accountIds.length === 0) return { data: [], meta: sourceState() };

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
    meta: sourceState(),
  };
}

export async function getPositions(appUserId: string): Promise<{ data: PositionRow[]; meta: SourceState }> {
  const accountIds = await accountIdsFor(appUserId);
  if (accountIds.length === 0) return { data: [], meta: sourceState() };

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
    meta: sourceState(),
  };
}

export async function getSettlements(appUserId: string): Promise<{ data: SettlementRow[]; meta: SourceState }> {
  const accountIds = await accountIdsFor(appUserId);
  if (accountIds.length === 0) return { data: [], meta: sourceState() };

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
    meta: sourceState(),
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
  const credentials = hasKalshiCredentials();

  return {
    data: {
      api: credentials ? "healthy" : "credentials_missing",
      lastSyncAt: latest?.completedAt?.toISOString() ?? latest?.startedAt?.toISOString() ?? null,
      lastStatus: latest?.status ?? null,
      lastError: latest?.errorMessage ?? null,
      websocket: "stubbed",
      readOnly: true,
      historicalImport: latest?.status === "success" ? "complete" : credentials ? "pending" : "stubbed",
    },
    meta: credentials ? { source: "stub", stubReason: STUB_REASON_LIVE_SYNC } : sourceState(),
  };
}

export async function createBackfillSyncRun(appUserId: string) {
  const credentials = hasKalshiCredentials();
  const account = credentials
    ? await getOrCreatePrimaryAccount({
        appUserId,
        environment: kalshiEnvironment(),
        keyIdHint: keyIdHint(),
      })
    : null;
  const reason = credentials
    ? "backfill import boundary ready; run worker implementation with Kalshi credentials"
    : STUB_REASON_AWAITING_KALSHI;

  const syncRun = await getPrisma().syncRun.create({
    data: {
      appUserId,
      kalshiAccountId: account?.id,
      kind: "backfill",
      source: "netlify-route",
      status: "stub",
      completedAt: new Date(),
      errorMessage: reason,
      stats: { stubReason: reason },
    },
  });

  return {
    data: {
      id: syncRun.id,
      status: syncRun.status,
      completedAt: syncRun.completedAt?.toISOString() ?? null,
      message: reason,
    },
    meta: { source: "stub" as const, stubReason: reason },
  };
}
