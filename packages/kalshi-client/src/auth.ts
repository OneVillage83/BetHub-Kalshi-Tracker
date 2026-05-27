import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import type { KalshiClientConfig, KalshiHttpMethod } from "./types";

export async function loadPrivateKey(privateKeyPath: string): Promise<string> {
  return readFile(privateKeyPath, "utf8");
}

export async function resolvePrivateKey(config: KalshiClientConfig): Promise<string> {
  if (config.privateKeyPem) return config.privateKeyPem;
  if (config.privateKeyBase64) return Buffer.from(config.privateKeyBase64, "base64").toString("utf8");
  if (process.env.KALSHI_PRIVATE_KEY_PEM) return process.env.KALSHI_PRIVATE_KEY_PEM;
  if (process.env.KALSHI_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.KALSHI_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }
  const privateKeyPath = config.privateKeyPath ?? process.env.KALSHI_PRIVATE_KEY_PATH;
  if (!privateKeyPath) {
    throw new Error("Missing Kalshi private key. Set KALSHI_PRIVATE_KEY_PEM, KALSHI_PRIVATE_KEY_BASE64, or KALSHI_PRIVATE_KEY_PATH.");
  }
  return loadPrivateKey(privateKeyPath);
}

export function signKalshiRequest(params: {
  privateKeyPem: string;
  timestampMs: string;
  method: KalshiHttpMethod;
  path: string;
}): string {
  const pathWithoutQuery = params.path.split("?")[0];
  const message = `${params.timestampMs}${params.method}${pathWithoutQuery}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(message), {
    key: params.privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}
