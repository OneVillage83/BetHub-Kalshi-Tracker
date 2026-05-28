import { spawnSync } from "node:child_process";

const isNetlifyBuild = Boolean(process.env.NETLIFY === "true" || process.env.CONTEXT || process.env.DEPLOY_URL || process.env.URL);

if (!process.env.DATABASE_URL && isNetlifyBuild) {
  console.log("DATABASE_URL is not configured; skipping Prisma migrate deploy.");
  console.log("Connect Prisma Postgres in Netlify to run migrations on the next deploy.");
  process.exit(0);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
