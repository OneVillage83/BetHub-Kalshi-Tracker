import { getOrCreatePrimaryAccount, getPrimaryAccount, getPrisma } from "@kalshi-tracker/db";
import { KalshiRestClient, type KalshiClientConfig } from "@kalshi-tracker/kalshi-client";
import { kalshiApiBaseUrl, kalshiEnvironment, keyIdHint } from "../env";
import type { AuthenticatedAppUser } from "../auth";
import { decryptSecret, encryptSecret, EncryptionConfigurationError, isEncryptionConfigured } from "./secrets";

export type KalshiCredentialStatus = {
  configured: boolean;
  environment: "demo" | "production";
  keyIdHint: string | null;
  configuredAt: string | null;
  syncEnabled: boolean;
  encryptionConfigured: boolean;
  globalFallbackAvailable: boolean;
};

export type KalshiCredentialInput = {
  environment: "demo" | "production";
  accessKeyId: string;
  privateKeyPem?: string | null;
  privateKeyBase64?: string | null;
  syncEnabled?: boolean;
};

export function globalCredentialFallbackEnabled() {
  return process.env.ALLOW_GLOBAL_KALSHI_CREDENTIAL_FALLBACK === "true";
}

export function hasGlobalKalshiCredentials() {
  return Boolean(
    process.env.KALSHI_ACCESS_KEY_ID &&
      (process.env.KALSHI_PRIVATE_KEY_PEM || process.env.KALSHI_PRIVATE_KEY_BASE64 || process.env.KALSHI_PRIVATE_KEY_PATH),
  );
}

export async function getKalshiCredentialStatus(appUserId: string): Promise<KalshiCredentialStatus> {
  const account = await getPrimaryAccount(appUserId);
  const hasStoredCredentials = Boolean(account?.accessKeyIdEncrypted && account.privateKeyPemEncrypted);
  const canUseGlobalFallback = globalCredentialFallbackEnabled() && hasGlobalKalshiCredentials();

  return {
    configured: hasStoredCredentials || canUseGlobalFallback,
    environment: account?.environment ?? kalshiEnvironment(),
    keyIdHint: account?.keyIdHint ?? (canUseGlobalFallback ? keyIdHint() : null),
    configuredAt: account?.credentialsConfiguredAt?.toISOString() ?? null,
    syncEnabled: account?.syncEnabled ?? true,
    encryptionConfigured: isEncryptionConfigured(),
    globalFallbackAvailable: canUseGlobalFallback,
  };
}

export async function saveKalshiCredentials(appUserId: string, input: KalshiCredentialInput) {
  const accessKeyId = input.accessKeyId.trim();
  const privateKeyPem = normalizePrivateKey(input);

  if (!accessKeyId) throw new Error("Kalshi key ID is required.");
  if (!privateKeyPem) throw new Error("Kalshi private key is required.");

  const client = new KalshiRestClient({
    baseUrl: kalshiApiBaseUrl(input.environment),
    accessKeyId,
    privateKeyPem,
  });
  await client.getBalance();

  const account = await getOrCreatePrimaryAccount({
    appUserId,
    environment: input.environment,
    keyIdHint: maskKeyId(accessKeyId),
  });

  await getPrisma().kalshiAccount.update({
    where: { id: account.id },
    data: {
      environment: input.environment,
      keyIdHint: maskKeyId(accessKeyId),
      accessKeyIdEncrypted: encryptSecret(accessKeyId),
      privateKeyPemEncrypted: encryptSecret(privateKeyPem),
      credentialsConfiguredAt: new Date(),
      syncEnabled: input.syncEnabled ?? true,
      readOnly: true,
    },
  });

  return getKalshiCredentialStatus(appUserId);
}

export async function deleteKalshiCredentials(appUserId: string) {
  const account = await getPrimaryAccount(appUserId);
  if (!account) return getKalshiCredentialStatus(appUserId);

  await getPrisma().kalshiAccount.update({
    where: { id: account.id },
    data: {
      keyIdHint: null,
      accessKeyIdEncrypted: null,
      privateKeyPemEncrypted: null,
      credentialsConfiguredAt: null,
      syncCursor: {},
      lastSyncAt: null,
    },
  });

  return getKalshiCredentialStatus(appUserId);
}

export async function buildKalshiClientForAppUser(appUser: AuthenticatedAppUser): Promise<{ client: KalshiRestClient; accountId: string }> {
  const account = await getOrCreatePrimaryAccount({
    appUserId: appUser.id,
    environment: kalshiEnvironment(),
    keyIdHint: null,
  });

  if (account.accessKeyIdEncrypted && account.privateKeyPemEncrypted) {
    return {
      accountId: account.id,
      client: new KalshiRestClient({
        baseUrl: kalshiApiBaseUrl(account.environment),
        accessKeyId: decryptSecret(account.accessKeyIdEncrypted),
        privateKeyPem: decryptSecret(account.privateKeyPemEncrypted),
      }),
    };
  }

  if (appUser.role === "owner" && globalCredentialFallbackEnabled() && hasGlobalKalshiCredentials()) {
    return {
      accountId: account.id,
      client: new KalshiRestClient(globalCredentialConfig(account.environment)),
    };
  }

  throw new EncryptionConfigurationError("Kalshi credentials are not configured for this user.");
}

export function globalCredentialConfig(environment: "demo" | "production" = kalshiEnvironment()): KalshiClientConfig {
  return {
    baseUrl: process.env.KALSHI_API_BASE_URL ?? kalshiApiBaseUrl(environment),
    accessKeyId: process.env.KALSHI_ACCESS_KEY_ID ?? "",
    privateKeyBase64: process.env.KALSHI_PRIVATE_KEY_BASE64,
    privateKeyPem: process.env.KALSHI_PRIVATE_KEY_PEM,
    privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH,
  };
}

function normalizePrivateKey(input: KalshiCredentialInput) {
  if (input.privateKeyPem?.trim()) return input.privateKeyPem.trim();
  if (!input.privateKeyBase64?.trim()) return null;
  return Buffer.from(input.privateKeyBase64.trim(), "base64").toString("utf8").trim();
}

function maskKeyId(accessKeyId: string) {
  if (accessKeyId.length <= 10) return accessKeyId;
  return `${accessKeyId.slice(0, 6)}...${accessKeyId.slice(-4)}`;
}
