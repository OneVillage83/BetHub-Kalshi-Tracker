import { apiError, apiResponse } from "../../../../lib/api-response";
import { requireAuthenticatedAppUser } from "../../../../lib/auth";
import { deleteKalshiCredentials, getKalshiCredentialStatus, saveKalshiCredentials } from "../../../../lib/server/kalshi-credentials";
import { EncryptionConfigurationError } from "../../../../lib/server/secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  return apiResponse(await getKalshiCredentialStatus(appUser.id, appUser));
}

export async function PUT(request: Request) {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  const body = await request.json().catch(() => ({}));
  try {
    const status = await saveKalshiCredentials(appUser.id, {
      accessKeyId: typeof body.accessKeyId === "string" ? body.accessKeyId : "",
      privateKeyPem: typeof body.privateKeyPem === "string" ? body.privateKeyPem : null,
      privateKeyBase64: typeof body.privateKeyBase64 === "string" ? body.privateKeyBase64 : null,
      syncEnabled: body.syncEnabled !== false,
    });
    return apiResponse(status);
  } catch (error) {
    const message = safeCredentialError(error);
    return apiError(message, error instanceof EncryptionConfigurationError ? 503 : 400);
  }
}

export async function DELETE() {
  const { appUser, response } = await requireAuthenticatedAppUser();
  if (!appUser) return response;

  await deleteKalshiCredentials(appUser.id);
  return apiResponse(await getKalshiCredentialStatus(appUser.id, appUser));
}

function safeCredentialError(error: unknown) {
  const message = error instanceof Error ? error.message : "Kalshi credential update failed.";
  if (message.includes("Kalshi API 401")) return "Kalshi rejected the provided API credentials.";
  if (message.includes("Kalshi API 403")) return "Kalshi credentials do not have access to this account.";
  if (message.includes("private key")) return message;
  if (message.includes("APP_ENCRYPTION_KEY")) return message;
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}
