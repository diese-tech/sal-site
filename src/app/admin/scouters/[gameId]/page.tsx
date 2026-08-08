import Link from "next/link";
import { notFound } from "next/navigation";
import { ScouterGameCorrectionEditor } from "@/components/admin/ScouterGameCorrectionEditor";
import { requireAdmin } from "@/lib/admin-auth";
import { getScouterGameCorrectionSnapshot } from "@/lib/scouter-corrections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Correct Scouter Game - SAL Admin" };

export default async function AdminScouterCorrectionPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const session = await requireAdmin();
  const { gameId } = await params;
  const snapshot = await getScouterGameCorrectionSnapshot(gameId);
  if (!snapshot) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        href={`/scouters/${encodeURIComponent(snapshot.matchId)}`}
        className="text-xs font-black uppercase text-slate-500 transition hover:text-slate-200"
      >
        ← Scouter receipt
      </Link>
      <header className="my-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">
          Admin · audited correction
        </p>
        <h1 className="text-3xl font-black text-white">
          Game {snapshot.gameOrdinal}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Full-game revision {snapshot.revision}. Nothing saves until the final
          confirmation.
        </p>
      </header>

      {session.discordId === "password-admin" ? (
        <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm text-amber-100">
          Sign out and use Discord admin login before correcting stats. The database
          requires a real Discord administrator identity for its immutable audit row.
        </section>
      ) : (
        <ScouterGameCorrectionEditor snapshot={snapshot} />
      )}
    </main>
  );
}
