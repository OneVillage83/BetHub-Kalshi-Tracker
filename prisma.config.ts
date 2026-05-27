import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://kalshi:kalshi@localhost:5432/kalshi_tracker?schema=public",
  },
});
