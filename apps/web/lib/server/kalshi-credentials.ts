import { getOrCreatePrimaryAccount, getPrimaryAccount, getPrisma, normalizeEmail, ownerEmailsFromEnv } from "@kalshi-tracker/db";
import { KalshiRestClient, resolvePrivateKey, type KalshiClientConfig } from "@kalshi-tracker/kalshi-client";
import { kalshiApiBaseUrl, kalshiEnvironment, keyIdHint } from "../env";
import type { AuthenticatedAppUser } from "../auth";
import { decryptSecret, encryptSecret, EncryptionConfigurationError, isEncryptionConfigured } from "./secrets";

export type KalshiCredentialSource = "per_user" | "legacy_netlify" | "missing";

export type KalshiCredentialStatus = {
  configured: boolean;
  credentialSource: KalshiCredentialSource;
  environment: "demo" | "production";
  keyIdHint: string | null;
  configuredAt: string | null;
  syncEnabled: boolean;
  encryptionConfigured: boolean;
  globalFallbackAvailable: boolean;
  legacyNetlifyKeyAvailable: boolean;
  canAdoptLegacyNetlifyKey: boolean;
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

export function credentialSourceFor(hasStoredCredentials: boolean, legacyNetlifyKeyAvailable: boolean): KalshiCredentialSource {
  if (hasStoredCredentials) return "per_user";
  if (legacyNetlifyKeyAvailable) return "legacy_netlify";
  return "missing";
}

export function canAdoptLegacyNetlifyKeyForAppUser(appUser: Pick<AuthenticatedAppUser, "email" | "role"> | null | undefined) {
  const email = normalizeEmail(appUser?.email);
  return Boolean(appUser?.role === "owner" && email && ownerEmailsFromEnv().has(email));
}

export async function getKalshiCredentialStatus(
  appUserId: string,
  appUser?: Pick<AuthenticatedAppUser, "email" | "role"> | null,
): Promise<KalshiCredentialStatus> {
  const account = await getPrimaryAccount(appUserId);
  const hasStoredCredentials = Boolean(account?.accessKeyIdEncrypted && account.privateKeyPemEncrypted);
  const legacyNetlifyKeyAvailable = hasGlobalKalshiCredentials();
  const canUseGlobalFallback = globalCredentialFallbackEnabled() && legacyNetlifyKeyAvailable;
  const canAdoptLegacyNetlifyKey =
    !hasStoredCredentials && legacyNetlifyKeyAvailable && isEncryptionConfigured() && canAdoptLegacyNetlifyKeyForAppUser(appUser);

  return {
    configured: hasStoredCredentials || canUseGlobalFallback,
    credentialSource: credentialSourceFor(hasStoredCredentials, legacyNetlifyKeyAvailable),
    environment: account?.environment ?? kalshiEnvironment(),
    keyIdHint: hasStoredCredentials ? (account?.keyIdHint ?? null) : legacyNetlifyKeyAvailable ? keyIdHint() : null,
    configuredAt: account?.credentialsConfiguredAt?.toISOString() ?? null,
    syncEnabled: account?.syncEnabled ?? true,
    encryptionConfigured: isEncryptionConfigured(),
    globalFallbackAvailable: canUseGlobalFallback,
    legacyNetlifyKeyAvailable,
    canAdoptLegacyNetlifyKey,
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

export async function adoptLegacyNetlifyCredentials(appUser: AuthenticatedAppUser) {
  if (!canAdoptLegacyNetlifyKeyForAppUser(appUser)) {
    throw new Error("Only the owner account can adopt the Netlify-stored Kalshi key.");
  }

  if (!hasGlobalKalshiCredentials()) {
    throw new Error("No Netlify-stored Kalshi key is available to adopt.");
  }

  const accessKeyId = process.env.KALSHI_ACCESS_KEY_ID?.trim();
  if (!accessKeyId) throw new Error("Netlify-stored Kalshi key ID is missing.");

  const environment = kalshiEnvironment();
  const config = globalCredentialConfig(environment);
  const privateKeyPem = (await resolvePrivateKey(config)).trim();
  if (!privateKeyPem) throw new Error("Netlify-stored Kalshi private key is missing.");

  const client = new KalshiRestClient({
    baseUrl: config.baseUrl,
    accessKeyId,
    privateKeyPem,
  });
  await client.getBalance();

  const account = await getOrCreatePrimaryAccount({
    appUserId: appUser.id,
    environment,
    keyIdHint: maskKeyId(accessKeyId),
  });

  await getPrisma().kalshiAccount.update({
    where: { id: account.id },
    data: {
      environment,
      keyIdHint: maskKeyId(accessKeyId),
      accessKeyIdEncrypted: encryptSecret(accessKeyId),
      privateKeyPemEncrypted: encryptSecret(privateKeyPem),
      credentialsConfiguredAt: new Date(),
      syncEnabled: true,
      readOnly: true,
    },
  });

  return getKalshiCredentialStatus(appUser.id, appUser);
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
