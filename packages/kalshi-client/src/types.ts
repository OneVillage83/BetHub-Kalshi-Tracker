export type KalshiClientConfig = {
  baseUrl: string;
  accessKeyId: string;
  privateKeyPath?: string;
  privateKeyPem?: string;
  privateKeyBase64?: string;
};

export type KalshiHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type KalshiRequestOptions = {
  method?: KalshiHttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  authenticated?: boolean;
};

export type KalshiPaginatedResponse<TItem, TKey extends string> = {
  cursor?: string;
} & Record<TKey, TItem[]>;
