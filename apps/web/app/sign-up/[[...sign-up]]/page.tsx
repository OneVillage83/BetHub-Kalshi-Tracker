import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { isClerkConfigured } from "../../../lib/env";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060b12] px-6 text-slate-100">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 block text-sm text-blue-300">
          BetHub Kalshi Tracker
        </Link>
        {isClerkConfigured() ? (
          <SignUp appearance={{ baseTheme: undefined }} />
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
            <h1 className="text-xl font-semibold">Clerk is not configured</h1>
            <p className="mt-3 text-sm text-slate-400">
              Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to enable account creation.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
