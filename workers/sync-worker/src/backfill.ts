import { KalshiRestClient } from "@kalshi-tracker/kalshi-client";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const client = new KalshiRestClient({
    baseUrl: required("KALSHI_API_BASE_URL"),
    accessKeyId: required("KALSHI_ACCESS_KEY_ID"),
    privateKeyPath: required("KALSHI_PRIVATE_KEY_PATH"),
  });

  console.log("Starting Kalshi backfill...");
  console.log("This scaffold intentionally prints counts only. Implement DB upserts next.");

  const [balance, fills, historicalFills, orders, historicalOrders, positions, settlements] = await Promise.all([
    client.getBalance(),
    client.getFills(),
    client.getHistoricalFills(),
    client.getOrders(),
    client.getHistoricalOrders(),
    client.getPositions(),
    client.getSettlements(),
  ]);

  console.log(JSON.stringify({
    balanceLoaded: Boolean(balance),
    fillsLoaded: Boolean(fills),
    historicalFillsLoaded: Boolean(historicalFills),
    ordersLoaded: Boolean(orders),
    historicalOrdersLoaded: Boolean(historicalOrders),
    positionsLoaded: Boolean(positions),
    settlementsLoaded: Boolean(settlements),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
