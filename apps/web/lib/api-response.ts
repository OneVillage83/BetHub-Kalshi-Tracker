export type ApiMeta = {
  source: "db" | "stub";
  generatedAt: string;
  stubReason?: string;
};

export type ApiEnvelope<T> = {
  data: T;
  meta: ApiMeta;
};

export function apiResponse<T>(data: T, meta?: Partial<ApiMeta>, init?: ResponseInit) {
  return Response.json(
    {
      data,
      meta: {
        source: meta?.source ?? "db",
        stubReason: meta?.stubReason,
        generatedAt: new Date().toISOString(),
      },
    } satisfies ApiEnvelope<T>,
    init,
  );
}

export function apiError(message: string, status = 500) {
  return Response.json(
    {
      error: {
        message,
      },
    },
    { status },
  );
}

export function csvResponse(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
