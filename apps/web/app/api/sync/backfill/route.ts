import { apiError, apiResponse } from "../../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../../lib/auth";
import { runKalshiBackfill } from "../../../../lib/server/backfill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  try {
    const result = await runKalshiBackfill(appUser);
    return apiResponse(result.data, result.meta, { status: result.meta.source === "stub" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kalshi backfill failed.";
    return apiError(message, 500);
  }
}
