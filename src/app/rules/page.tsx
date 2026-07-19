import type { Metadata } from "next";
import Link from "next/link";
import { RulesAssistant } from "@/components/rules/RulesAssistant";

export const metadata: Metadata = {
  title: "Rules and Rulings | Serpent Ascension League",
  description: "Published SAL rules, public-safe precedent, and the official ruling request entry point.",
};

const SOURCE_HIERARCHY = [
  {
    rank: "01",
    title: "Current published rules",
    description: "The active, versioned SAL rulebook is the controlling public source.",
    accent: "border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-200",
  },
  {
    rank: "02",
    title: "Approved public precedent",
    description: "Sanitized decisions may explain how a rule applied, but they never override a current rule.",
    accent: "border-violet-300/25 bg-violet-300/[0.06] text-violet-200",
  },
  {
    rank: "03",
    title: "Official admin review",
    description: "Ambiguous, incomplete, or conflicting cases belong in a tracked ruling ticket.",
    accent: "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200",
  },
] as const;

export default function RulesPage() {
  return (
    <main className="relative overflow-hidden pb-20">
      <div className="sal-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(167,139,250,0.14),transparent_32%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-slate-950/80 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
          <div className="h-1 bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400" />
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.6fr] lg:p-10">
            <div>
              <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                League governance
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
                Rules should be clear before the lobby starts.
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-300 sm:text-base">
                This will be the public home for versioned SAL rules, approved public-safe precedent, and tracked ruling
                requests. Published rules always outrank precedent.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#rule-library"
                  className="rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  Browse rule sources
                </a>
                <a
                  href="#request-a-ruling"
                  className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-violet-100 transition hover:bg-violet-300/15"
                >
                  Request a ruling
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.75)]" />
                <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-200">
                  Source connection pending
                </p>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                The new public rule library and assistant are safely disabled until approved sources and feature gates
                are connected. No placeholder answer is treated as an SAL ruling.
              </p>
              <Link
                href="/report-a-bug"
                className="mt-5 inline-flex text-xs font-black uppercase tracking-wide text-amber-200 transition hover:text-amber-100"
              >
                Report a site issue <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="space-y-8">
            <section aria-labelledby="source-order-heading">
              <div className="mb-4">
                <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Decision path
                </p>
                <h2 id="source-order-heading" className="mt-1 text-2xl font-black text-white">
                  How guidance is evaluated
                </h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {SOURCE_HIERARCHY.map((source) => (
                  <article key={source.rank} className={`rounded-2xl border p-5 ${source.accent}`}>
                    <span className="font-mono text-[0.65rem] font-semibold tracking-[0.2em] opacity-70">{source.rank}</span>
                    <h3 className="mt-4 text-sm font-black uppercase tracking-wide text-white">{source.title}</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{source.description}</p>
                  </article>
                ))}
              </div>
              <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold leading-5 text-slate-400">
                If a precedent conflicts with a current published rule, the assistant must use the current rule, hide any
                private precedent detail, and route the conflict for admin remediation.
              </p>
            </section>

            <section
              id="rule-library"
              aria-labelledby="rule-library-heading"
              className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/75 shadow-xl shadow-black/25"
            >
              <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    Canonical sources
                  </p>
                  <h2 id="rule-library-heading" className="mt-1 text-xl font-black text-white">Published rule library</h2>
                </div>
                <span className="w-fit rounded-full border border-slate-600/40 bg-slate-800/70 px-3 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">
                  Not connected
                </span>
              </div>
              <div className="p-6 text-center sm:p-10">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200">
                  <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5v-15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5v15A2.5 2.5 0 016.5 18" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-black text-white">No rule text has been published to this page yet.</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-400">
                  The shell does not copy old Discord posts or invent temporary rules. Only an approved, versioned public
                  source will appear here.
                </p>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-black text-white">Need a binding decision?</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                  Assistant guidance is advisory. A binding eligibility or game-day decision requires an authorized SAL
                  admin and a tracked ticket.
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-black text-white">Privacy at launch</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                  One-shot guidance is not stored as chat history. Confirmed official requests are separate tracked
                  records. Public models may receive only published rules, approved sanitized findings, and redacted facts.
                </p>
              </article>
            </section>
          </div>

          <div className="lg:sticky lg:top-28">
            <RulesAssistant />
          </div>
        </div>
      </div>
    </main>
  );
}
