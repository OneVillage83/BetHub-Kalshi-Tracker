import { apiError, apiResponse } from "../../../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../../../lib/auth";
import { runKalshiBackfill } from "../../../../../lib/server/backfill";
import { backfillResponseStatus } from "../route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  try {
    const result = await runKalshiBackfill(appUser, {
      kind: "backfill-continue",
      source: "netlify-route",
      allowContinuation: true,
    });
    return apiResponse(result.data, result.meta, { status: backfillResponseStatus(result.data, result.meta) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kalshi backfill continuation failed.";
    return apiError(message, 500);
  }
}
