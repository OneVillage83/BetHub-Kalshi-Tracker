-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "KalshiEnvironment" AS ENUM ('demo', 'production');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('running', 'success', 'failed', 'stub');

-- CreateEnum
CREATE TYPE "OutcomeSide" AS ENUM ('yes', 'no', 'unknown');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('resting', 'executed', 'canceled', 'unknown');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KalshiAccount" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Primary Kalshi',
    "environment" "KalshiEnvironment" NOT NULL DEFAULT 'demo',
    "keyIdHint" TEXT,
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KalshiAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "ticker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "category" TEXT,
    "status" TEXT,
    "closeTime" TIMESTAMP(3),
    "expirationTime" TIMESTAMP(3),
    "settlementTime" TIMESTAMP(3),
    "yesAsk" INTEGER,
    "yesBid" INTEGER,
    "noAsk" INTEGER,
    "noBid" INTEGER,
    "lastPrice" INTEGER,
    "volume" DECIMAL(20,4),
    "liquidity" INTEGER,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "Event" (
    "ticker" TEXT NOT NULL,
    "title" TEXT,
    "category" TEXT,
    "status" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "kalshiAccountId" TEXT NOT NULL,
    "fillId" TEXT NOT NULL,
    "tradeId" TEXT,
    "orderId" TEXT,
    "marketTicker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "outcomeSide" "OutcomeSide" NOT NULL DEFAULT 'unknown',
    "action" TEXT,
    "contractCount" DECIMAL(20,4) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'portfolio',
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "kalshiAccountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "marketTicker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "outcomeSide" "OutcomeSide" NOT NULL DEFAULT 'unknown',
    "action" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'unknown',
    "originalCount" DECIMAL(20,4),
    "remainingCount" DECIMAL(20,4),
    "filledCount" DECIMAL(20,4),
    "priceCents" INTEGER,
    "createdTime" TIMESTAMP(3),
    "updatedTime" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'portfolio',
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "kalshiAccountId" TEXT NOT NULL,
    "marketTicker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "positionContracts" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "totalTraded" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "averagePriceCents" INTEGER,
    "markPriceCents" INTEGER,
    "exposureCents" INTEGER,
    "realizedPnlCents" INTEGER NOT NULL DEFAULT 0,
    "unrealizedPnlCents" INTEGER,
    "feesPaidCents" INTEGER NOT NULL DEFAULT 0,
    "rawJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "kalshiAccountId" TEXT NOT NULL,
    "marketTicker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "settledTime" TIMESTAMP(3),
    "realizedPnlCents" INTEGER,
    "revenueCents" INTEGER,
    "feeCents" INTEGER,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL,
    "kalshiAccountId" TEXT NOT NULL,
    "cashBalanceCents" INTEGER,
    "portfolioValueCents" INTEGER,
    "rawJson" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetNote" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "marketTicker" TEXT,
    "fillId" TEXT,
    "title" TEXT,
    "thesis" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mistakeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT NOT NULL,
    "kalshiAccountId" TEXT,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'running',
    "kind" TEXT NOT NULL DEFAULT 'backfill',
    "source" TEXT NOT NULL DEFAULT 'api',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "stats" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_clerkUserId_key" ON "AppUser"("clerkUserId");

-- CreateIndex
CREATE INDEX "KalshiAccount_appUserId_idx" ON "KalshiAccount"("appUserId");

-- CreateIndex
CREATE INDEX "Fill_kalshiAccountId_createdTime_idx" ON "Fill"("kalshiAccountId", "createdTime");

-- CreateIndex
CREATE INDEX "Fill_marketTicker_idx" ON "Fill"("marketTicker");

-- CreateIndex
CREATE UNIQUE INDEX "Fill_kalshiAccountId_fillId_key" ON "Fill"("kalshiAccountId", "fillId");

-- CreateIndex
CREATE INDEX "Order_kalshiAccountId_updatedTime_idx" ON "Order"("kalshiAccountId", "updatedTime");

-- CreateIndex
CREATE INDEX "Order_marketTicker_idx" ON "Order"("marketTicker");

-- CreateIndex
CREATE UNIQUE INDEX "Order_kalshiAccountId_orderId_key" ON "Order"("kalshiAccountId", "orderId");

-- CreateIndex
CREATE INDEX "Position_kalshiAccountId_syncedAt_idx" ON "Position"("kalshiAccountId", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Position_kalshiAccountId_marketTicker_key" ON "Position"("kalshiAccountId", "marketTicker");

-- CreateIndex
CREATE INDEX "Settlement_kalshiAccountId_settledTime_idx" ON "Settlement"("kalshiAccountId", "settledTime");

-- CreateIndex
CREATE INDEX "Settlement_marketTicker_idx" ON "Settlement"("marketTicker");

-- CreateIndex
CREATE INDEX "BalanceSnapshot_kalshiAccountId_capturedAt_idx" ON "BalanceSnapshot"("kalshiAccountId", "capturedAt");

-- CreateIndex
CREATE INDEX "BetNote_appUserId_updatedAt_idx" ON "BetNote"("appUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "BetNote_marketTicker_idx" ON "BetNote"("marketTicker");

-- CreateIndex
CREATE INDEX "SyncRun_appUserId_startedAt_idx" ON "SyncRun"("appUserId", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_kalshiAccountId_startedAt_idx" ON "SyncRun"("kalshiAccountId", "startedAt");

-- AddForeignKey
ALTER TABLE "KalshiAccount" ADD CONSTRAINT "KalshiAccount_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_eventTicker_fkey" FOREIGN KEY ("eventTicker") REFERENCES "Event"("ticker") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_kalshiAccountId_fkey" FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_marketTicker_fkey" FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_kalshiAccountId_fkey" FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketTicker_fkey" FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_kalshiAccountId_fkey" FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_marketTicker_fkey" FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_kalshiAccountId_fkey" FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_marketTicker_fkey" FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_kalshiAccountId_fkey" FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetNote" ADD CONSTRAINT "BetNote_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_appUserId_fkey" FOREIGN KEY ("appUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_kalshiAccountId_fkey" FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
