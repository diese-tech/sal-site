import type { Metadata } from "next";
import { BugReportStatusClient } from "@/components/bug-report/BugReportStatusClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private Bug Report Status - SAL",
  description: "View the private status of a SAL bug report.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BugReportStatusPage({
  params,
}: {
  params: Promise<{ publicTicketId: string }>;
}) {
  const { publicTicketId } = await params;

  return (
    <main className="relative isolate min-h-[calc(100vh-104px)] overflow-hidden">
      <div className="sal-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,0.13),transparent_30%),linear-gradient(to_bottom,rgba(5,9,18,0.72),#050912_72%)]" />
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
          League support
        </p>
        <h1 className="mt-3 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
          Private ticket status
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
          This page uses either your signed-in Discord session or the private access fragment from
          your receipt. The fragment is removed from the address bar before the ticket is loaded.
        </p>
        <div className="mt-8">
          <BugReportStatusClient publicTicketId={publicTicketId} />
        </div>
      </div>
    </main>
  );
}
