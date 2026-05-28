import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./secrets";

const previousKey = process.env.APP_ENCRYPTION_KEY;

afterEach(() => {
  if (previousKey === undefined) {
    delete process.env.APP_ENCRYPTION_KEY;
  } else {
    process.env.APP_ENCRYPTION_KEY = previousKey;
  }
});

describe("secret encryption", () => {
  it("round-trips secrets with a base64 32-byte key", () => {
    process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

    const encrypted = encryptSecret("private-value");

    expect(encrypted).not.toContain("private-value");
    expect(decryptSecret(encrypted)).toBe("private-value");
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("treats malformed keys as unconfigured", () => {
    process.env.APP_ENCRYPTION_KEY = "not-a-valid-32-byte-key";
    expect(isEncryptionConfigured()).toBe(false);
  });
});
