import type { Metadata } from "next";
import { BugReportForm } from "@/components/bug-report/BugReportForm";
import { getAuthUser, getDiscordId } from "@/lib/supabase-auth-server";
import { getBugReportRuntime } from "@/lib/bug-reports/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report a Bug - SAL",
  description: "Send a private bug report to the Serpent Ascension League team.",
};

export default async function ReportABugPage() {
  const user = await getAuthUser();
  const relayAvailable = Boolean(user && getDiscordId(user));
  const submissionEnabled = getBugReportRuntime().ready;

  return (
    <main className="relative isolate min-h-[calc(100vh-104px)] overflow-hidden">
      <div className="sal-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_10%,rgba(34,211,238,0.13),transparent_30%),radial-gradient(circle_at_84%_24%,rgba(45,212,191,0.1),transparent_25%),linear-gradient(to_bottom,rgba(5,9,18,0.72),#050912_72%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 max-w-3xl">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              League support
            </p>
            <span
              className={`rounded-md border px-2.5 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-wider ${
                submissionEnabled
                  ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
                  : "border-amber-300/30 bg-amber-300/10 text-amber-200"
              }`}
            >
              {submissionEnabled ? "Intake online" : "Intake preparing"}
            </span>
          </div>
          <h1 className="u-font-display text-4xl font-black tracking-tight text-white sm:text-5xl">
            Found something broken?
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Give the SAL team a clear report and we will route it to the right people. Reports are
            anonymous by default, and you can review everything before it is sent.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
          <BugReportForm relayAvailable={relayAvailable} submissionEnabled={submissionEnabled} />
          <aside className="space-y-4 lg:sticky lg:top-32">
            <InfoCard
              eyebrow="Privacy"
              title="Anonymous by default"
              tone="cyan"
              items={[
                "Your name is not included in the staff ticket.",
                "Signed-in identity is linked only when you request private Discord replies.",
                "Only an Owner may reveal that hidden link for a documented safety, abuse, or legal reason.",
              ]}
            />
            <InfoCard
              eyebrow="What happens next"
              title="A trackable ticket"
              tone="emerald"
              items={[
                "You receive a private status link and recovery code after the report is safely stored.",
                "Staff can acknowledge, investigate, ask for details, and record a resolution.",
                "Waiting tickets get a reminder after 3 days and close as No Response after 7 days.",
              ]}
            />
            <div className="rounded-[var(--sal-card-radius)] border border-amber-300/20 bg-amber-300/[0.06] p-4">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
                Keep secrets out
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Never include passwords, access tokens, database credentials, or private personal
                information. Critical means urgent impact, not permission to publish exploit details.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function InfoCard({
  eyebrow,
  title,
  tone,
  items,
}: {
  eyebrow: string;
  title: string;
  tone: "cyan" | "emerald";
  items: string[];
}) {
  const toneClasses =
    tone === "cyan"
      ? "border-cyan-300/20 bg-cyan-300/[0.05] text-cyan-300"
      : "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-300";

  return (
    <section className={`rounded-[var(--sal-card-radius)] border p-5 ${toneClasses}`}>
      <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em]">{eyebrow}</p>
      <h2 className="u-font-display mt-1 text-lg font-bold text-white">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-xs leading-5 text-slate-400">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
