export default function Loading() {
  return (
    <main className="min-h-screen bg-[#060b12] p-6 text-slate-100">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-800" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-lg bg-slate-900" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-900" />
        <div className="h-32 animate-pulse rounded-lg bg-slate-900" />
      </div>
    </main>
  );
}
