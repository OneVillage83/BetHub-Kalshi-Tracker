import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  const payload = await req.json().catch(() => ({}));
  console.log("Scheduled Kalshi sync stub invoked", {
    nextRun: payload.next_run,
    reason: "WebSocket/live sync worker is intentionally stubbed for Netlify scaffold.",
  });
};

export const config: Config = {
  schedule: "@hourly",
};
