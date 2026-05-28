import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export class EncryptionConfigurationError extends Error {
  constructor(message = "APP_ENCRYPTION_KEY is not configured.") {
    super(message);
    this.name = "EncryptionConfigurationError";
  }
}

export function isEncryptionConfigured() {
  return Boolean(process.env.APP_ENCRYPTION_KEY && encryptionKeyFromEnv(false));
}

export function encryptSecret(value: string) {
  const key = encryptionKeyFromEnv(true);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(value: string) {
  const key = encryptionKeyFromEnv(true);
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Encrypted secret payload is malformed.");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivEncoded, "base64"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

function encryptionKeyFromEnv(throwOnError: true): Buffer;
function encryptionKeyFromEnv(throwOnError: false): Buffer | null;
function encryptionKeyFromEnv(throwOnError: boolean): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    if (throwOnError) throw new EncryptionConfigurationError();
    return null;
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    if (throwOnError) throw new EncryptionConfigurationError("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    return null;
  }

  return key;
}
