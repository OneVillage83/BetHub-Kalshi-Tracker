import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateAppUser, isDatabaseConfigurationError, isInviteRequiredError } from "@kalshi-tracker/db";
import { isClerkConfigured } from "./env";

export type AuthenticatedAppUser = {
  id: string;
  clerkUserId: string;
  email: string | null;
  role: "owner" | "user";
};

export type PageAuthState =
  | { status: "authenticated"; appUser: AuthenticatedAppUser }
  | { status: "signed_out"; appUser: null }
  | { status: "access_denied"; appUser: null; message: string };

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
    role: appUser.role,
  };
}

export async function getPageAuthState(): Promise<PageAuthState> {
  try {
    const appUser = await getAuthenticatedAppUser();
    if (!appUser) return { status: "signed_out", appUser: null };
    return { status: "authenticated", appUser };
  } catch (error) {
    if (isInviteRequiredError(error)) {
      return {
        status: "access_denied",
        appUser: null,
        message: error instanceof Error ? error.message : "This account has not been invited.",
      };
    }
    throw error;
  }
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
    if (isInviteRequiredError(error)) {
      return {
        appUser: null,
        response: Response.json(
          {
            error: {
              message: error instanceof Error ? error.message : "This account has not been invited.",
              code: "INVITE_REQUIRED",
            },
          },
          { status: 403 },
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

export async function requireOwnerAppUser() {
  const result = await requireAuthenticatedAppUser();
  if (!result.appUser) return result;

  if (result.appUser.role !== "owner") {
    return {
      appUser: null,
      response: Response.json({ error: { message: "Owner access required", code: "OWNER_REQUIRED" } }, { status: 403 }),
    };
  }

  return result;
}
