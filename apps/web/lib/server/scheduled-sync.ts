import { getPrisma } from "@kalshi-tracker/db";
import type { AuthenticatedAppUser } from "../auth";
import { runKalshiBackfill } from "./backfill";

export type ScheduledSyncResult = {
  processed: number;
  skipped: number;
  failed: number;
  messages: string[];
};

const LOCK_WINDOW_MS = 15 * 60 * 1000;
const DUE_WINDOW_MS = 60 * 60 * 1000;

export async function runScheduledKalshiSync(maxAccounts = 3): Promise<ScheduledSyncResult> {
  const prisma = getPrisma();
  const now = Date.now();
  const lockedAfter = new Date(now - LOCK_WINDOW_MS);
  const dueBefore = new Date(now - DUE_WINDOW_MS);
  const accounts = await prisma.kalshiAccount.findMany({
    where: {
      syncEnabled: true,
      accessKeyIdEncrypted: { not: null },
      privateKeyPemEncrypted: { not: null },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: dueBefore } }],
      syncRuns: {
        none: {
          status: "running",
          lockedAt: { gt: lockedAfter },
        },
      },
    },
    include: { appUser: true },
    orderBy: [{ lastSyncAt: "asc" }, { createdAt: "asc" }],
    take: maxAccounts,
  });

  const result: ScheduledSyncResult = {
    processed: 0,
    skipped: 0,
    failed: 0,
    messages: [],
  };

  for (const account of accounts) {
    const appUser: AuthenticatedAppUser = {
      id: account.appUser.id,
      clerkUserId: account.appUser.clerkUserId,
      email: account.appUser.email,
      role: account.appUser.role,
    };

    try {
      await runKalshiBackfill(appUser, { kind: "scheduled-incremental", source: "netlify-scheduled" });
      result.processed += 1;
      result.messages.push(`synced ${account.id}`);
    } catch (error) {
      result.failed += 1;
      result.messages.push(error instanceof Error ? error.message : `sync failed for ${account.id}`);
    }
  }

  result.skipped = Math.max(0, maxAccounts - result.processed - result.failed);
  return result;
}
