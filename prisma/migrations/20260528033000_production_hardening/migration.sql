CREATE TYPE "AppUserRole" AS ENUM ('owner', 'user');

ALTER TABLE "AppUser"
  ADD COLUMN "role" "AppUserRole" NOT NULL DEFAULT 'user',
  ADD COLUMN "lastSeenAt" TIMESTAMP(3);

UPDATE "AppUser"
SET "role" = 'owner'
WHERE "createdAt" = (SELECT MIN("createdAt") FROM "AppUser");

ALTER TABLE "KalshiAccount"
  ADD COLUMN "accessKeyIdEncrypted" TEXT,
  ADD COLUMN "privateKeyPemEncrypted" TEXT,
  ADD COLUMN "credentialsConfiguredAt" TIMESTAMP(3),
  ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastSyncAt" TIMESTAMP(3),
  ADD COLUMN "syncCursor" JSONB;

ALTER TABLE "Settlement"
  ADD COLUMN "rawHash" TEXT;

ALTER TABLE "SyncRun"
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "cursor" JSONB;

CREATE TABLE "Invite" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "AppUserRole" NOT NULL DEFAULT 'user',
  "invitedByAppUserId" TEXT,
  "acceptedByAppUserId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_email_key" ON "Invite"("email");
CREATE UNIQUE INDEX "Invite_acceptedByAppUserId_key" ON "Invite"("acceptedByAppUserId");
CREATE INDEX "Invite_email_revokedAt_idx" ON "Invite"("email", "revokedAt");
CREATE INDEX "Invite_invitedByAppUserId_idx" ON "Invite"("invitedByAppUserId");
CREATE UNIQUE INDEX "Settlement_kalshiAccountId_rawHash_key" ON "Settlement"("kalshiAccountId", "rawHash");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedByAppUserId_fkey"
  FOREIGN KEY ("invitedByAppUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_acceptedByAppUserId_fkey"
  FOREIGN KEY ("acceptedByAppUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
