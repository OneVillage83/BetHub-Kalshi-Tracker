import { apiResponse } from "../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../lib/auth";
import { getSettlements } from "../../../lib/server/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const result = await getSettlements(appUser.id);
  return apiResponse(result.data, result.meta);
}
