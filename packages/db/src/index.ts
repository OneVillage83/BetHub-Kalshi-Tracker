import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export class DatabaseConfigurationError extends Error {
  constructor(message = "Database is not configured.") {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

export class InviteRequiredError extends Error {
  constructor(message = "This account has not been invited to BetHub Kalshi Tracker.") {
    super(message);
    this.name = "InviteRequiredError";
  }
}

export function getDatabaseConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  if (isHostedRuntime()) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is not configured for this Netlify deployment. Connect Prisma Postgres and redeploy.",
    );
  }

  return "postgresql://kalshi:kalshi@localhost:5432/kalshi_tracker?schema=public";
}

export function isDatabaseConfigured() {
  return isHostedRuntime() ? Boolean(process.env.DATABASE_URL) : Boolean(getDatabaseConnectionString());
}

export function isHostedRuntime() {
  return Boolean(
    process.env.NETLIFY === "true" ||
      process.env.CONTEXT ||
      process.env.DEPLOY_URL ||
      process.env.URL ||
      (process.env.NODE_ENV === "production" && process.env.CI),
  );
}

export function isDatabaseConfigurationError(error: unknown) {
  return error instanceof DatabaseConfigurationError || (error instanceof Error && error.name === "DatabaseConfigurationError");
}

export function isInviteRequiredError(error: unknown) {
  return error instanceof InviteRequiredError || (error instanceof Error && error.name === "InviteRequiredError");
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatabaseConnectionString() }),
    });
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});

export function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

const defaultOwnerEmails = "f_rodriguez91@yahoo.com";

export function ownerEmailsFromEnv(value?: string) {
  const emailSource = arguments.length > 0 ? value : (process.env.OWNER_EMAILS ?? defaultOwnerEmails);

  return new Set(
    (emailSource ?? "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter((email): email is string => Boolean(email)),
  );
}

export async function getOrCreateAppUser(params: { clerkUserId: string; email?: string | null }) {
  const email = normalizeEmail(params.email);
  const ownerEmails = ownerEmailsFromEnv();
  const isOwnerEmail = Boolean(email && ownerEmails.has(email));
  const existing = await getPrisma().appUser.findUnique({
    where: { clerkUserId: params.clerkUserId },
  });

  if (existing) {
    return getPrisma().appUser.update({
      where: { id: existing.id },
      data: {
        email: email ?? existing.email,
        role: isOwnerEmail ? "owner" : existing.role,
        lastSeenAt: new Date(),
      },
    });
  }

  if (isOwnerEmail) {
    return getPrisma().appUser.create({
      data: {
        clerkUserId: params.clerkUserId,
        email,
        role: "owner",
        lastSeenAt: new Date(),
      },
    });
  }

  if (!email) throw new InviteRequiredError("Your Clerk account does not have an email address that can be matched to an invite.");

  const invite = await getPrisma().invite.findUnique({
    where: { email },
  });

  if (!invite || invite.revokedAt) {
    throw new InviteRequiredError();
  }

  const appUser = await getPrisma().appUser.create({
    data: {
      clerkUserId: params.clerkUserId,
      email,
      role: invite.role,
      lastSeenAt: new Date(),
    },
  });

  await getPrisma().invite.update({
    where: { id: invite.id },
    data: {
      acceptedByAppUserId: appUser.id,
      acceptedAt: invite.acceptedAt ?? new Date(),
    },
  });

  return appUser;
}

export async function getPrimaryAccount(appUserId: string) {
  return getPrisma().kalshiAccount.findFirst({
    where: { appUserId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getOrCreatePrimaryAccount(params: {
  appUserId: string;
  environment?: "demo" | "production";
  keyIdHint?: string | null;
}) {
  const existing = await getPrimaryAccount(params.appUserId);
  if (existing) return existing;

  return getPrisma().kalshiAccount.create({
    data: {
      appUserId: params.appUserId,
      environment: params.environment ?? "demo",
      keyIdHint: params.keyIdHint ?? null,
      readOnly: true,
    },
  });
}

export function buildEnsureMarketUpsertArgs(ticker: string, rawJson: Prisma.InputJsonValue = {}) {
  return {
    where: { ticker },
    create: {
      ticker,
      rawJson,
    },
    update: {},
  } satisfies Prisma.MarketUpsertArgs;
}

export async function ensureMarket(ticker: string, rawJson: Prisma.InputJsonValue = {}) {
  return getPrisma().market.upsert({
    ...buildEnsureMarketUpsertArgs(ticker, rawJson),
  });
}

export function decimalToString(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return null;
  return value.toString();
}

export async function isDatabaseSchemaReady() {
  try {
    const rows = await getPrisma().$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'AppUser'
      ) AS "exists"
    `;

    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}
