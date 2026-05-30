CREATE TABLE "AnalyticsDailyRollup" (
  "id" TEXT NOT NULL,
  "kalshiAccountId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "equityCents" INTEGER NOT NULL,
  "cashBalanceCents" INTEGER NOT NULL,
  "portfolioValueCents" INTEGER NOT NULL,
  "realizedPnlCents" INTEGER NOT NULL,
  "unrealizedPnlCents" INTEGER NOT NULL,
  "totalPnlCents" INTEGER NOT NULL,
  "grossPnlCents" INTEGER NOT NULL,
  "feesCents" INTEGER NOT NULL,
  "exposureCents" INTEGER NOT NULL,
  "drawdownCents" INTEGER NOT NULL,
  "costBasisCents" INTEGER NOT NULL,
  "fillCount" INTEGER NOT NULL DEFAULT 0,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "settlementCount" INTEGER NOT NULL DEFAULT 0,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyticsDailyRollup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsFillMetric" (
  "id" TEXT NOT NULL,
  "kalshiAccountId" TEXT NOT NULL,
  "fillId" TEXT NOT NULL,
  "orderId" TEXT,
  "marketTicker" TEXT NOT NULL,
  "eventTicker" TEXT,
  "category" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "side" "OutcomeSide" NOT NULL DEFAULT 'unknown',
  "action" TEXT,
  "entryPriceCents" INTEGER NOT NULL,
  "priceBucket" TEXT NOT NULL,
  "contractCount" DECIMAL(20,4) NOT NULL,
  "costCents" INTEGER NOT NULL,
  "feeCents" INTEGER NOT NULL DEFAULT 0,
  "clv1hCents" INTEGER,
  "clv24hCents" INTEGER,
  "clvCloseCents" INTEGER,
  "brierScore" DECIMAL(12,8),
  "settled" BOOLEAN NOT NULL DEFAULT false,
  "won" BOOLEAN,
  "realizedPnlCents" INTEGER,
  "orderCreatedAt" TIMESTAMP(3),
  "timeToFillSeconds" INTEGER,
  "nearestOrderbookObservedAt" TIMESTAMP(3),
  "midpointCents" INTEGER,
  "spreadCents" INTEGER,
  "slippageCents" INTEGER,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyticsFillMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsPositionMetric" (
  "id" TEXT NOT NULL,
  "kalshiAccountId" TEXT NOT NULL,
  "metricDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "marketTicker" TEXT NOT NULL,
  "eventTicker" TEXT,
  "category" TEXT,
  "side" "OutcomeSide" NOT NULL DEFAULT 'unknown',
  "positionContracts" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "exposureCents" INTEGER NOT NULL,
  "unrealizedPnlCents" INTEGER NOT NULL,
  "realizedPnlCents" INTEGER NOT NULL,
  "worstCaseLossCents" INTEGER NOT NULL,
  "closeDate" TIMESTAMP(3),
  "concentrationWeight" DECIMAL(12,8),
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalyticsPositionMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsDailyRollup_kalshiAccountId_date_key" ON "AnalyticsDailyRollup"("kalshiAccountId", "date");
CREATE INDEX "AnalyticsDailyRollup_kalshiAccountId_date_idx" ON "AnalyticsDailyRollup"("kalshiAccountId", "date");

CREATE UNIQUE INDEX "AnalyticsFillMetric_kalshiAccountId_fillId_key" ON "AnalyticsFillMetric"("kalshiAccountId", "fillId");
CREATE INDEX "AnalyticsFillMetric_kalshiAccountId_marketTicker_idx" ON "AnalyticsFillMetric"("kalshiAccountId", "marketTicker");
CREATE INDEX "AnalyticsFillMetric_category_idx" ON "AnalyticsFillMetric"("category");

CREATE UNIQUE INDEX "AnalyticsPositionMetric_kalshiAccountId_metricDate_marketTicker_key"
  ON "AnalyticsPositionMetric"("kalshiAccountId", "metricDate", "marketTicker");
CREATE INDEX "AnalyticsPositionMetric_kalshiAccountId_metricDate_idx" ON "AnalyticsPositionMetric"("kalshiAccountId", "metricDate");
CREATE INDEX "AnalyticsPositionMetric_category_idx" ON "AnalyticsPositionMetric"("category");

ALTER TABLE "AnalyticsDailyRollup" ADD CONSTRAINT "AnalyticsDailyRollup_kalshiAccountId_fkey"
  FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsFillMetric" ADD CONSTRAINT "AnalyticsFillMetric_kalshiAccountId_fkey"
  FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsFillMetric" ADD CONSTRAINT "AnalyticsFillMetric_marketTicker_fkey"
  FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsPositionMetric" ADD CONSTRAINT "AnalyticsPositionMetric_kalshiAccountId_fkey"
  FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsPositionMetric" ADD CONSTRAINT "AnalyticsPositionMetric_marketTicker_fkey"
  FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;
