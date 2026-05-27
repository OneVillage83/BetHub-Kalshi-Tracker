import { csvResponse } from "../../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../../lib/auth";
import { toCsv } from "../../../../lib/csv";
import { getFills } from "../../../../lib/server/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const { data } = await getFills(appUser.id);
  return csvResponse(
    "kalshi-fills.csv",
    toCsv(data, ["createdTime", "marketTicker", "marketTitle", "outcomeSide", "action", "contractCount", "priceCents", "feeCents", "source"]),
  );
}
