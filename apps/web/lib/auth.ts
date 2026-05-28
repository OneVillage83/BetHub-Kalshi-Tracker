import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateAppUser, isDatabaseConfigurationError } from "@kalshi-tracker/db";
import { isClerkConfigured } from "./env";

export type AuthenticatedAppUser = {
  id: string;
  clerkUserId: string;
  email: string | null;
};

export async function getAuthenticatedAppUser(): Promise<AuthenticatedAppUser | null> {
  if (!isClerkConfigured()) return null;

  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  const appUser = await getOrCreateAppUser({ clerkUserId: userId, email });

  return {
    id: appUser.id,
    clerkUserId: appUser.clerkUserId,
    email: appUser.email,
  };
}

export async function requireAuthenticatedAppUser() {
  let appUser: AuthenticatedAppUser | null;
  try {
    appUser = await getAuthenticatedAppUser();
  } catch (error) {
    if (isDatabaseConfigurationError(error)) {
      return {
        appUser: null,
        response: Response.json(
          {
            error: {
              message: "Database is not configured for this deployment.",
              code: "DATABASE_NOT_CONFIGURED",
            },
          },
          { status: 503 },
        ),
      };
    }
    throw error;
  }

  if (!appUser) {
    return {
      appUser: null,
      response: Response.json({ error: { message: "Unauthorized" } }, { status: 401 }),
    };
  }

  return { appUser, response: null };
}
