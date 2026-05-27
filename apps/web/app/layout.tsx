import "./globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "../lib/env";

export const metadata: Metadata = {
  title: "BetHub Kalshi Tracker",
  description: "Read-only Kalshi bet tracker and analytics dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );

  if (!isClerkConfigured()) return body;

  return <ClerkProvider>{body}</ClerkProvider>;
}
