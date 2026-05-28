import { apiError, apiResponse } from "../../../../../lib/api-response";
import { requireOwnerAppUser } from "../../../../../lib/auth";
import { adoptLegacyNetlifyCredentials } from "../../../../../lib/server/kalshi-credentials";
import { EncryptionConfigurationError } from "../../../../../lib/server/secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const { appUser, response } = await requireOwnerAppUser();
  if (!appUser) return response;

  try {
    return apiResponse(await adoptLegacyNetlifyCredentials(appUser));
  } catch (error) {
    const message = safeAdoptionError(error);
    return apiError(message, error instanceof EncryptionConfigurationError ? 503 : 400);
  }
}

function safeAdoptionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Netlify-stored Kalshi key adoption failed.";
  if (message.includes("Kalshi API 401")) return "Kalshi rejected the Netlify-stored API credentials.";
  if (message.includes("Kalshi API 403")) return "Kalshi credentials do not have access to this account.";
  if (message.includes("private key")) return message;
  if (message.includes("APP_ENCRYPTION_KEY")) return message;
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}
