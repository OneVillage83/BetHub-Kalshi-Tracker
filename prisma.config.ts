import { getConnectionString } from "@netlify/database";
import { defineConfig } from "prisma/config";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  try {
    return getConnectionString();
  } catch {
    if (process.env.NETLIFY === "true") {
      throw new Error("Netlify Database is not available. Ensure @netlify/database is installed and the site has a provisioned database.");
    }

    return "postgresql://kalshi:kalshi@localhost:5432/kalshi_tracker?schema=public";
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl(),
  },
});
