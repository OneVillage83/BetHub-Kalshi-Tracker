import { csvResponse } from "../../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../../lib/auth";
import { toCsv } from "../../../../lib/csv";
import { getSettlements } from "../../../../lib/server/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const { data } = await getSettlements(appUser.id);
  return csvResponse(
    "kalshi-settlements.csv",
    toCsv(data, ["settledTime", "marketTicker", "marketTitle", "realizedPnlCents", "revenueCents", "feeCents"]),
  );
}
