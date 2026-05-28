import { getPrisma, normalizeEmail } from "@kalshi-tracker/db";

export type InviteRow = {
  id: string;
  email: string;
  role: "owner" | "user";
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export async function listInvites() {
  const invites = await getPrisma().invite.findMany({
    orderBy: { createdAt: "desc" },
  });
  return invites.map(toInviteRow);
}

export async function createInvite(params: { email: string; role?: "owner" | "user"; invitedByAppUserId: string }) {
  const email = normalizeEmail(params.email);
  if (!email) throw new Error("Invite email is required.");

  const invite = await getPrisma().invite.upsert({
    where: { email },
    create: {
      email,
      role: params.role ?? "user",
      invitedByAppUserId: params.invitedByAppUserId,
    },
    update: {
      role: params.role ?? "user",
      revokedAt: null,
      invitedByAppUserId: params.invitedByAppUserId,
    },
  });

  return toInviteRow(invite);
}

export async function revokeInvite(id: string) {
  const invite = await getPrisma().invite.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return toInviteRow(invite);
}

function toInviteRow(invite: {
  id: string;
  email: string;
  role: "owner" | "user";
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): InviteRow {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}
