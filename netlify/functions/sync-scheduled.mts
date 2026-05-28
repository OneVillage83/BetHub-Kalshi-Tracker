import type { Config } from "@netlify/functions";
import { runScheduledKalshiSync } from "../../apps/web/lib/server/scheduled-sync";

export default async (req: Request) => {
  hydrateProcessEnvFromNetlify();
  const payload = await req.json().catch(() => ({}));
  const result = await runScheduledKalshiSync();
  console.log("Scheduled Kalshi sync completed", {
    nextRun: payload.next_run,
    ...result,
  });
};

export const config: Config = {
  schedule: "@hourly",
};

function hydrateProcessEnvFromNetlify() {
  const netlifyEnv = (globalThis as { Netlify?: { env?: { get(key: string): string | undefined } } }).Netlify?.env;
  if (!netlifyEnv) return;

  for (const key of ["DATABASE_URL", "APP_ENCRYPTION_KEY", "READ_ONLY_MODE"]) {
    const value = netlifyEnv.get(key);
    if (value && !process.env[key]) process.env[key] = value;
  }
}
