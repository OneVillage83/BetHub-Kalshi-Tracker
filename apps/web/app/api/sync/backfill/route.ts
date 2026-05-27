import { apiResponse } from "../../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../../lib/auth";
import { createBackfillSyncRun } from "../../../../lib/server/data";

export const dynamic = "force-dynamic";

export async function POST() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const result = await createBackfillSyncRun(appUser.id);
  return apiResponse(result.data, result.meta, { status: 202 });
}
