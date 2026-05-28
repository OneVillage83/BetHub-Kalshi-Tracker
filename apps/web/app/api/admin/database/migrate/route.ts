import { applyInitialMigration } from "@kalshi-tracker/db/migrations";
import { apiResponse } from "../../../../../lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expectedToken = process.env.ADMIN_MIGRATION_TOKEN;
  const actualToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!expectedToken || actualToken !== expectedToken) {
    return Response.json({ error: { message: "Not found" } }, { status: 404 });
  }

  try {
    const result = await applyInitialMigration();
    return apiResponse(result);
  } catch (error) {
    return Response.json(
      {
        error: {
          message: "Database migration failed",
          detail: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 },
    );
  }
}
