import { apiResponse } from "../../../../../lib/api-response";
import { requireOwnerAppUser } from "../../../../../lib/auth";
import { revokeInvite } from "../../../../../lib/server/invites";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { appUser, response } = await requireOwnerAppUser();
  if (!appUser) return response;

  const { id } = await params;
  return apiResponse(await revokeInvite(id));
}
