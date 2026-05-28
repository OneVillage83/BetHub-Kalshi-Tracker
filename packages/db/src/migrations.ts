import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { getDatabaseConnectionString } from "./index";

export async function applyInitialMigration() {
  const migrationName = "20260528001000_init";
  const migrationSql = await readInitialMigrationSql(migrationName);
  const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");
  const client = new Client({ connectionString: getDatabaseConnectionString() });

  await client.connect();

  try {
    const ready = await isSchemaReady(client);
    if (ready) {
      await ensureMigrationMarker(client, migrationName, checksum);
      return { migrated: false, schemaReady: true, migrationMarked: true };
    }

    await client.query("BEGIN");
    await client.query(migrationSql);
    await ensureMigrationMarker(client, migrationName, checksum);
    await client.query("COMMIT");

    return { migrated: true, schemaReady: true, migrationMarked: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function isSchemaReady(client: Client) {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'AppUser'
    ) AS "exists"`,
  );

  return Boolean(result.rows[0]?.exists);
}

async function readInitialMigrationSql(migrationName: string) {
  const candidates = [
    path.join(/*turbopackIgnore: true*/ process.cwd(), "prisma", "migrations", migrationName, "migration.sql"),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "prisma", "migrations", migrationName, "migration.sql"),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Try the next likely runtime path.
    }
  }

  throw new Error(`Could not read Prisma migration ${migrationName}.`);
}

async function ensureMigrationMarker(client: Client, migrationName: string, checksum: string) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);

  await client.query(
    `INSERT INTO "_prisma_migrations" (
      "id",
      "checksum",
      "finished_at",
      "migration_name",
      "logs",
      "rolled_back_at",
      "started_at",
      "applied_steps_count"
    )
    SELECT $1, $2, now(), $3, NULL, NULL, now(), 1
    WHERE NOT EXISTS (
      SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $3
    )`,
    [crypto.randomUUID(), checksum, migrationName],
  );
}
