import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL for Prisma client.");
    }

    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});

export async function getOrCreateAppUser(params: { clerkUserId: string; email?: string | null }) {
  return getPrisma().appUser.upsert({
    where: { clerkUserId: params.clerkUserId },
    create: {
      clerkUserId: params.clerkUserId,
      email: params.email ?? null,
    },
    update: {
      email: params.email ?? undefined,
    },
  });
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
