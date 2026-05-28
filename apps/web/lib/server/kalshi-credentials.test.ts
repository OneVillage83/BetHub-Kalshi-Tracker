import { afterEach, describe, expect, it } from "vitest";
import { canAdoptLegacyNetlifyKeyForAppUser, credentialSourceFor } from "./kalshi-credentials";

const previousOwnerEmails = process.env.OWNER_EMAILS;

afterEach(() => {
  if (previousOwnerEmails === undefined) {
    delete process.env.OWNER_EMAILS;
  } else {
    process.env.OWNER_EMAILS = previousOwnerEmails;
  }
});

describe("Kalshi credential status helpers", () => {
  it("reports per-user credentials before legacy Netlify keys", () => {
    expect(credentialSourceFor(true, true)).toBe("per_user");
    expect(credentialSourceFor(false, true)).toBe("legacy_netlify");
    expect(credentialSourceFor(false, false)).toBe("missing");
  });

  it("allows only the configured owner email to adopt the Netlify-stored key", () => {
    delete process.env.OWNER_EMAILS;

    expect(canAdoptLegacyNetlifyKeyForAppUser({ email: "f_rodriguez91@yahoo.com", role: "owner" })).toBe(true);
    expect(canAdoptLegacyNetlifyKeyForAppUser({ email: "other@example.com", role: "owner" })).toBe(false);
    expect(canAdoptLegacyNetlifyKeyForAppUser({ email: "f_rodriguez91@yahoo.com", role: "user" })).toBe(false);
  });
});
