import type { Metadata } from "next";
import Link from "next/link";
import { RulesAssistant } from "@/components/rules/RulesAssistant";
import { RULEBOOK_EMBED_URL, RULEBOOK_PUBLIC_URL } from "@/lib/public-assistant/config";

export const metadata: Metadata = {
  title: "Rules and Rulings | Serpent Ascension League",
  description: "Official SAL rules and guidance for league questions.",
};

const SOURCE_HIERARCHY = [
  {
    rank: "01",
    title: "Published rulebook",
    description: "The current written SAL rules and competition procedures.",
    accent: "border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-200",
  },
  {
    rank: "02",
    title: "Approved precedents",
    description: "Pre-approved council scenarios that clarify how rules apply.",
    accent: "border-violet-300/25 bg-violet-300/[0.06] text-violet-200",
  },
  {
    rank: "03",
    title: "SAL admin review",
    description: "Required when sources conflict or do not clearly resolve a case.",
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
                League rules
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
                Know the rules before the lobby starts.
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-300 sm:text-base">
                Read the official SAL rulebook or ask how a rule applies. SAL admins make the final call on
                case-specific rulings.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#rule-library"
                  className="rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  View the rulebook
                </a>
                <a
                  href="#request-a-ruling"
                  className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-violet-100 transition hover:bg-violet-300/15"
                >
                  Ask a rules question
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.75)]" />
                <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-200">
                  Official guidance
                </p>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                Start with the published rulebook. Contact a SAL admin when you need a binding decision for a match,
                roster, or player.
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
                  Where to look first
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
            </section>

            <section
              id="rule-library"
              aria-labelledby="rule-library-heading"
              className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/75 shadow-xl shadow-black/25"
            >
              <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    Official source
                  </p>
                  <h2 id="rule-library-heading" className="mt-1 text-xl font-black text-white">Published rule library</h2>
                </div>
                <span className="w-fit rounded-full border border-slate-600/40 bg-slate-800/70 px-3 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400">
                  Available
                </span>
              </div>
              <div className="p-4 sm:p-6">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
                  <iframe
                    src={RULEBOOK_EMBED_URL}
                    title="Serpent Ascension League published rulebook"
                    loading="lazy"
                    className="h-[32rem] w-full sm:h-[44rem]"
                  />
                </div>
                <div className="mt-4 text-center">
                  <p className="text-xs font-semibold text-slate-500">
                    If the embedded reader does not load, open the source document directly.
                  </p>
                <a
                  href={RULEBOOK_PUBLIC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex rounded-xl border border-cyan-300/35 bg-cyan-300/15 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  Open the rulebook <span aria-hidden="true" className="ml-1">↗</span>
                </a>
                </div>
              </div>
            </section>

            <section
              id="terra-adaptation"
              aria-labelledby="terra-adaptation-heading"
              className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] p-5"
            >
              <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Approved precedent
              </p>
              <h2 id="terra-adaptation-heading" className="mt-1 text-lg font-black text-white">
                Terra Division adaptation
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                Unless a Terra-specific rule or approved council ruling says otherwise, Terra follows Solar Division
                rules adapted one tier upward. Cases that remain unclear or create a source conflict go to SAL admin or
                council review.
              </p>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-black text-white">Need a final decision?</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                  Use the assistant for general guidance. Ask a SAL admin for eligibility, dispute, or game-day rulings.
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-black text-white">Keep private details private</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                  Do not paste private evidence or personal information into a general rules question.
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
