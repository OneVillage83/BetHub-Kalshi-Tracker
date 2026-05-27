import { apiResponse } from "../../../lib/api-response";
import { hasKalshiCredentials, isClerkConfigured } from "../../../lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiResponse({
    ok: true,
    service: "bethub-kalshi-tracker",
    clerkConfigured: isClerkConfigured(),
    kalshiCredentialsConfigured: hasKalshiCredentials(),
    readOnly: true,
  });
}
