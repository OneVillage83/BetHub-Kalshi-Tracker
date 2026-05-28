CREATE TABLE "EventPosition" (
  "id" TEXT NOT NULL,
  "kalshiAccountId" TEXT NOT NULL,
  "eventTicker" TEXT NOT NULL,
  "totalCostCents" INTEGER,
  "totalCostShares" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "eventExposureCents" INTEGER,
  "realizedPnlCents" INTEGER NOT NULL DEFAULT 0,
  "feesPaidCents" INTEGER NOT NULL DEFAULT 0,
  "rawJson" JSONB NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventPosition_kalshiAccountId_eventTicker_key" ON "EventPosition"("kalshiAccountId", "eventTicker");
CREATE INDEX "EventPosition_kalshiAccountId_syncedAt_idx" ON "EventPosition"("kalshiAccountId", "syncedAt");
CREATE INDEX "EventPosition_eventTicker_idx" ON "EventPosition"("eventTicker");

ALTER TABLE "EventPosition" ADD CONSTRAINT "EventPosition_kalshiAccountId_fkey"
  FOREIGN KEY ("kalshiAccountId") REFERENCES "KalshiAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventPosition" ADD CONSTRAINT "EventPosition_eventTicker_fkey"
  FOREIGN KEY ("eventTicker") REFERENCES "Event"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;
