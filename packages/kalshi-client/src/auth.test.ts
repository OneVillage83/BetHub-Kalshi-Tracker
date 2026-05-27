import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { signKalshiRequest } from "./auth";

describe("signKalshiRequest", () => {
  it("signs the full API path without query parameters", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const signature = signKalshiRequest({
      privateKeyPem,
      timestampMs: "1703123456789",
      method: "GET",
      path: "/trade-api/v2/portfolio/orders?limit=5",
    });

    const verified = crypto.verify(
      "RSA-SHA256",
      Buffer.from("1703123456789GET/trade-api/v2/portfolio/orders"),
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      Buffer.from(signature, "base64"),
    );

    expect(verified).toBe(true);
  });
});
