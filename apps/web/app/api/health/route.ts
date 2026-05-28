import { apiResponse } from "../../../lib/api-response";
import { hasKalshiCredentials, isClerkConfigured } from "../../../lib/env";
import { isDatabaseConfigured } from "@kalshi-tracker/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiResponse({
    ok: true,
    service: "bethub-kalshi-tracker",
    clerkConfigured: isClerkConfigured(),
    databaseConfigured: isDatabaseConfigured(),
    kalshiCredentialsConfigured: hasKalshiCredentials(),
    readOnly: true,
  });
}
