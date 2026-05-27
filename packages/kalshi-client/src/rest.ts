import { resolvePrivateKey, signKalshiRequest } from "./auth";
import type { KalshiClientConfig, KalshiPaginatedResponse, KalshiRequestOptions } from "./types";

export class KalshiRestClient {
  constructor(private readonly config: KalshiClientConfig) {}

  async request<T>(options: KalshiRequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    if (method !== "GET" && process.env.READ_ONLY_MODE !== "false") {
      throw new Error(`Read-only Kalshi client blocked ${method} ${options.path}`);
    }

    const url = new URL(`${this.config.baseUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {};

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options.authenticated !== false) {
      const timestampMs = Date.now().toString();
      const privateKeyPem = await resolvePrivateKey(this.config);
      headers["KALSHI-ACCESS-KEY"] = this.config.accessKeyId;
      headers["KALSHI-ACCESS-TIMESTAMP"] = timestampMs;
      headers["KALSHI-ACCESS-SIGNATURE"] = signKalshiRequest({
        privateKeyPem,
        timestampMs,
        method,
        path: url.pathname,
      });
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Kalshi API ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async paginate<TItem, TKey extends string>(
    path: string,
    collectionKey: TKey,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<TItem[]> {
    const results: TItem[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.request<KalshiPaginatedResponse<TItem, TKey>>({
        path,
        query: { limit: 1000, ...query, cursor },
      });
      results.push(...(page[collectionKey] ?? []));
      cursor = page.cursor || undefined;
    } while (cursor);

    return results;
  }

  getBalance() {
    return this.request({ path: "/portfolio/balance" });
  }

  getFills(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.request({ path: "/portfolio/fills", query });
  }

  getAllFills(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.paginate("/portfolio/fills", "fills", query);
  }

  getHistoricalFills(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.request({ path: "/historical/fills", query });
  }

  getAllHistoricalFills(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.paginate("/historical/fills", "fills", query);
  }

  getOrders(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.request({ path: "/portfolio/orders", query });
  }

  getAllOrders(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.paginate("/portfolio/orders", "orders", query);
  }

  getHistoricalOrders(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.request({ path: "/historical/orders", query });
  }

  getAllHistoricalOrders(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.paginate("/historical/orders", "orders", query);
  }

  getPositions(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.request({ path: "/portfolio/positions", query });
  }

  getAllPositions(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.paginate("/portfolio/positions", "positions", query);
  }

  getSettlements(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.request({ path: "/portfolio/settlements", query });
  }

  getAllSettlements(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.paginate("/portfolio/settlements", "settlements", query);
  }

  getMarketsByTickers(tickers: string[]) {
    return this.request({ path: "/markets", query: { tickers: tickers.join(",") }, authenticated: false });
  }

  getMarket(ticker: string) {
    return this.request({ path: `/markets/${encodeURIComponent(ticker)}`, authenticated: false });
  }

  getEvent(eventTicker: string) {
    return this.request({ path: `/events/${encodeURIComponent(eventTicker)}`, authenticated: false });
  }

  getEvents(query: Record<string, string | number | boolean | undefined> = {}) {
    return this.request({ path: "/events", query, authenticated: false });
  }
}
