import { apiError, apiResponse } from "../../../../lib/api-response";
import { requireOwnerAppUser } from "../../../../lib/auth";
import { createInvite, listInvites } from "../../../../lib/server/invites";

export const dynamic = "force-dynamic";

export async function GET() {
  const { appUser, response } = await requireOwnerAppUser();
  if (!appUser) return response;

  return apiResponse(await listInvites());
}

export async function POST(request: Request) {
  const { appUser, response } = await requireOwnerAppUser();
  if (!appUser) return response;

  const body = await request.json().catch(() => ({}));
  try {
    const invite = await createInvite({
      email: typeof body.email === "string" ? body.email : "",
      role: body.role === "owner" ? "owner" : "user",
      invitedByAppUserId: appUser.id,
    });
    return apiResponse(invite, undefined, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Invite creation failed.", 400);
  }
}
