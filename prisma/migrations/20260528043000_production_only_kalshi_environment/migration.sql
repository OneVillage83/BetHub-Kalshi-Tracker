-- Remove non-production account mode. Existing rows are migrated to production.
UPDATE "KalshiAccount"
SET "environment" = 'production'
WHERE "environment"::text <> 'production';

ALTER TYPE "KalshiEnvironment" RENAME TO "KalshiEnvironment_old";
CREATE TYPE "KalshiEnvironment" AS ENUM ('production');

ALTER TABLE "KalshiAccount" ALTER COLUMN "environment" DROP DEFAULT;
ALTER TABLE "KalshiAccount"
  ALTER COLUMN "environment" TYPE "KalshiEnvironment"
  USING "environment"::text::"KalshiEnvironment";
ALTER TABLE "KalshiAccount" ALTER COLUMN "environment" SET DEFAULT 'production';

DROP TYPE "KalshiEnvironment_old";
