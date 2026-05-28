import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkConfigured } from "./lib/env";

const isProtectedRoute = createRouteMatcher([
  "/",
  "/analytics(.*)",
  "/bet-history(.*)",
  "/exports(.*)",
  "/journal(.*)",
  "/positions(.*)",
  "/settings(.*)",
  "/settlements(.*)",
  "/api((?!/health).*)",
]);

const handler = isClerkConfigured()
  ? clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) await auth.protect();
    })
  : () => NextResponse.next();

export default handler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
