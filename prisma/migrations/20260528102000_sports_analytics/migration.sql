CREATE TABLE "SportsMarketClassification" (
  "marketTicker" TEXT NOT NULL,
  "eventTicker" TEXT,
  "eventName" TEXT,
  "sport" TEXT,
  "league" TEXT,
  "marketType" TEXT,
  "teams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "primaryTeam" TEXT,
  "opponentTeam" TEXT,
  "classificationSource" TEXT NOT NULL DEFAULT 'heuristic',
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SportsMarketClassification_pkey" PRIMARY KEY ("marketTicker")
);

CREATE TABLE "MarketCandlestick" (
  "id" TEXT NOT NULL,
  "marketTicker" TEXT NOT NULL,
  "periodIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
  "endPeriod" TIMESTAMP(3) NOT NULL,
  "yesBidCloseCents" INTEGER,
  "yesAskCloseCents" INTEGER,
  "priceCloseCents" INTEGER,
  "priceMeanCents" INTEGER,
  "volume" DECIMAL(20,4),
  "openInterest" DECIMAL(20,4),
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketCandlestick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderbookSnapshot" (
  "id" TEXT NOT NULL,
  "marketTicker" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "yesBidCents" INTEGER,
  "yesAskCents" INTEGER,
  "noBidCents" INTEGER,
  "noAskCents" INTEGER,
  "spreadCents" INTEGER,
  "midpointCents" INTEGER,
  "rawJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderbookSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SportsFillAnalytics" (
  "id" TEXT NOT NULL,
  "kalshiAccountId" TEXT NOT NULL,
  "fillId" TEXT NOT NULL,
  "marketTicker" TEXT NOT NULL,
  "eventTicker" TEXT,
  "sport" TEXT,
  "league" TEXT,
  "team" TEXT,
  "opponentTeam" TEXT,
  "marketType" TEXT,
  "chosenSide" "OutcomeSide" NOT NULL DEFAULT 'unknown',
  "entryPriceCents" INTEGER NOT NULL,
  "priceBucket" TEXT NOT NULL,
  "clv15mCents" INTEGER,
  "clv1hCents" INTEGER,
  "clv6hCents" INTEGER,
  "clv24hCents" INTEGER,
  "clvCloseCents" INTEGER,
  "nearestOrderbookObservedAt" TIMESTAMP(3),
  "midPriceCents" INTEGER,
  "spreadCents" INTEGER,
  "slippageCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SportsFillAnalytics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SportsMarketClassification_sport_league_idx" ON "SportsMarketClassification"("sport", "league");
CREATE INDEX "SportsMarketClassification_eventTicker_idx" ON "SportsMarketClassification"("eventTicker");

CREATE UNIQUE INDEX "MarketCandlestick_marketTicker_periodIntervalMinutes_endPeriod_key"
  ON "MarketCandlestick"("marketTicker", "periodIntervalMinutes", "endPeriod");
CREATE INDEX "MarketCandlestick_marketTicker_endPeriod_idx" ON "MarketCandlestick"("marketTicker", "endPeriod");

CREATE UNIQUE INDEX "OrderbookSnapshot_marketTicker_observedAt_key" ON "OrderbookSnapshot"("marketTicker", "observedAt");
CREATE INDEX "OrderbookSnapshot_marketTicker_observedAt_idx" ON "OrderbookSnapshot"("marketTicker", "observedAt");

CREATE UNIQUE INDEX "SportsFillAnalytics_kalshiAccountId_fillId_key" ON "SportsFillAnalytics"("kalshiAccountId", "fillId");
CREATE INDEX "SportsFillAnalytics_kalshiAccountId_marketTicker_idx" ON "SportsFillAnalytics"("kalshiAccountId", "marketTicker");
CREATE INDEX "SportsFillAnalytics_sport_league_idx" ON "SportsFillAnalytics"("sport", "league");

ALTER TABLE "SportsMarketClassification" ADD CONSTRAINT "SportsMarketClassification_marketTicker_fkey"
  FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketCandlestick" ADD CONSTRAINT "MarketCandlestick_marketTicker_fkey"
  FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderbookSnapshot" ADD CONSTRAINT "OrderbookSnapshot_marketTicker_fkey"
  FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SportsFillAnalytics" ADD CONSTRAINT "SportsFillAnalytics_kalshiAccountId_fkey"
  FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SportsFillAnalytics" ADD CONSTRAINT "SportsFillAnalytics_marketTicker_fkey"
  FOREIGN KEY ("marketTicker") REFERENCES "Market"("ticker") ON DELETE CASCADE ON UPDATE CASCADE;
