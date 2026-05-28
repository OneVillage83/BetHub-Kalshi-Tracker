import { apiResponse } from "../../../lib/api-response";
import { hasKalshiCredentials, isClerkConfigured } from "../../../lib/env";
import { isDatabaseConfigured, isDatabaseSchemaReady } from "@kalshi-tracker/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  const databaseSchemaReady = databaseConfigured ? await isDatabaseSchemaReady() : false;

  return apiResponse({
    ok: true,
    service: "bethub-kalshi-tracker",
    clerkConfigured: isClerkConfigured(),
    databaseConfigured,
    databaseSchemaReady,
    kalshiCredentialsConfigured: hasKalshiCredentials(),
    readOnly: true,
  });
}
