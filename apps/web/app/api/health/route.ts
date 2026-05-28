import { apiResponse } from "../../../lib/api-response";
import { isClerkConfigured } from "../../../lib/env";
import { getPrisma, isDatabaseConfigured, isDatabaseSchemaReady, ownerEmailsFromEnv } from "@kalshi-tracker/db";
import { hasGlobalKalshiCredentials } from "../../../lib/server/kalshi-credentials";
import { isEncryptionConfigured } from "../../../lib/server/secrets";
import rootPackage from "../../../../../package.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  const startedAt = Date.now();
  const databaseSchemaReady = databaseConfigured ? await isDatabaseSchemaReady() : false;
  let databaseLatencyMs: number | null = null;
  let lastScheduledSyncAt: string | null = null;
  let lastSuccessfulSyncAt: string | null = null;
  let lastError: string | null = null;

  if (databaseSchemaReady) {
    await getPrisma().$queryRaw`SELECT 1`;
    databaseLatencyMs = Date.now() - startedAt;
    const [lastScheduledSync, lastSuccessfulSync, latestSync] = await Promise.all([
      getPrisma().syncRun.findFirst({ where: { source: "netlify-scheduled" }, orderBy: { startedAt: "desc" } }),
      getPrisma().syncRun.findFirst({ where: { status: "success" }, orderBy: { completedAt: "desc" } }),
      getPrisma().syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    ]);
    lastScheduledSyncAt = lastScheduledSync?.completedAt?.toISOString() ?? lastScheduledSync?.startedAt.toISOString() ?? null;
    lastSuccessfulSyncAt = lastSuccessfulSync?.completedAt?.toISOString() ?? null;
    lastError = latestSync?.status === "failed" ? (latestSync.errorMessage ?? null) : null;
  }

  return apiResponse({
    ok: true,
    service: "bethub-kalshi-tracker",
    appVersion: rootPackage.version,
    clerkConfigured: isClerkConfigured(),
    databaseConfigured,
    databaseSchemaReady,
    databaseLatencyMs,
    encryptionConfigured: isEncryptionConfigured(),
    ownerEmailsConfigured: ownerEmailsFromEnv().size > 0,
    globalKalshiCredentialsConfigured: hasGlobalKalshiCredentials(),
    lastScheduledSyncAt,
    lastSuccessfulSyncAt,
    lastError,
    readOnly: true,
  });
}
