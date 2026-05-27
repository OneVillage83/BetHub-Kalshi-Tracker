"use client";

import {
  BarChart3,
  BookOpen,
  Briefcase,
  CheckCircle2,
  FileDown,
  Grid2X2,
  History,
  LockKeyhole,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import type { ApiMeta } from "../lib/api-response";
import { SourceBadge } from "./source-badge";

const nav = [
  { href: "/", label: "Dashboard", icon: Grid2X2 },
  { href: "/bet-history", label: "Bet History", icon: History },
  { href: "/positions", label: "Open Positions", icon: Briefcase },
  { href: "/settlements", label: "Settled Bets", icon: CheckCircle2 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/exports", label: "Exports", icon: FileDown },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  meta,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  meta?: Partial<ApiMeta>;
}) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#060b12] text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-800 bg-slate-950/90 p-5 lg:block">
        <Link href="/" className="flex items-center gap-3 text-xl font-bold">
          <span className="rounded-lg bg-blue-500/15 px-3 py-2 text-blue-300">B</span>
          <span>BetHub Tracker</span>
        </Link>
        <nav className="mt-9 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  active ? "bg-blue-600/20 text-blue-200" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-slate-800 bg-slate-900/80 p-4">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <div className="mt-3 text-sm font-medium">Read-only mode</div>
          <p className="mt-1 text-xs text-slate-500">No order placement endpoints are enabled.</p>
        </div>
      </aside>

      <section className="lg:ml-64">
        <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{title}</h1>
                <SourceBadge meta={meta} />
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                  <LockKeyhole className="mr-1 inline h-3 w-3" />
                  Read-only
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/settings" className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                Settings
              </Link>
              <div className="rounded-full border border-slate-800 bg-slate-900 p-1">
                <UserButton />
              </div>
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href} className="whitespace-nowrap rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </section>
    </main>
  );
}
