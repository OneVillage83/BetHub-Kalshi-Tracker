"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060b12] px-6 text-slate-100">
      <section className="w-full max-w-xl rounded-lg border border-amber-500/30 bg-slate-950 p-6 shadow-xl shadow-black/20">
        <div className="text-sm font-semibold uppercase tracking-normal text-amber-300">Database setup needed</div>
        <h1 className="mt-3 text-2xl font-semibold">The app could not load your tracker data.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This usually means the Prisma Postgres connection or schema migration is not ready yet. The deployment should recover after
          DATABASE_URL is configured and the initial migration runs.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
            Try again
          </button>
          <a href="/api/health" className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
            Check health
          </a>
          <a href="/sign-in" className="rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
            Sign in
          </a>
        </div>
      </section>
    </main>
  );
}
