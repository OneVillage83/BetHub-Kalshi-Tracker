import { defineConfig } from "prisma/config";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  return "postgresql://kalshi:kalshi@localhost:5432/kalshi_tracker?schema=public";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl(),
  },
});
