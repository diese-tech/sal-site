import type { Metadata } from "next";
import { HostMatchReportReviewClient } from "@/components/match-report/HostMatchReportReviewClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Private Match Stat Review - SAL",
  description: "Correct OCR statistics for a hosted SAL match.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function HostMatchReportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="relative isolate min-h-[calc(100vh-104px)] overflow-hidden">
      <div className="sal-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,0.13),transparent_30%),linear-gradient(to_bottom,rgba(5,9,18,0.72),#050912_72%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Official match capture</p>
        <h1 className="u-font-display mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">Correct match statistics</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">Your private access token is removed from the address bar before any report data loads.</p>
        <div className="mt-8"><HostMatchReportReviewClient reportId={id} /></div>
      </div>
    </main>
  );
}
