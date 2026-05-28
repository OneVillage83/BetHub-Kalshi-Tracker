export const STUB_REASON_AWAITING_KALSHI = "awaiting Kalshi credentials";
export const STUB_REASON_LIVE_SYNC = "Netlify scaffold does not run a persistent Kalshi WebSocket listener";

export function isClerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function hasKalshiCredentials() {
  return Boolean(
    process.env.KALSHI_ACCESS_KEY_ID &&
      (process.env.KALSHI_PRIVATE_KEY_PEM ||
        process.env.KALSHI_PRIVATE_KEY_BASE64 ||
        process.env.KALSHI_PRIVATE_KEY_PATH),
  );
}

export function kalshiApiBaseUrl() {
  if (process.env.KALSHI_API_BASE_URL) return process.env.KALSHI_API_BASE_URL;
  return "https://external-api.kalshi.com/trade-api/v2";
}

export function keyIdHint() {
  const key = process.env.KALSHI_ACCESS_KEY_ID;
  if (!key) return null;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
