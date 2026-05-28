import Link from "next/link";

export function AccessDenied({ message }: { message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060b12] px-6 text-slate-100">
      <section className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-950 p-6 shadow-xl shadow-black/20">
        <div className="text-sm font-semibold uppercase tracking-normal text-amber-300">Invite required</div>
        <h1 className="mt-3 text-2xl font-semibold">This account is not invited yet.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {message ?? "Ask an owner to invite the email address on your Clerk account, then sign in again."}
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/sign-in" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
            Sign in
          </Link>
          <Link href="/api/health" className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
            Health
          </Link>
        </div>
      </section>
    </main>
  );
}
