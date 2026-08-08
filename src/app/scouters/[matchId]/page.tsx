import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getScouterReceipt } from "@/lib/scouter-receipt";

// The public receipt is cached by Supabase/CDN, but this page must render per
// request because the correction link is visible only to an admin session.
export const dynamic = "force-dynamic";

function titleCase(value: string | null) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function ScouterReceiptPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const [receipt, adminSession] = await Promise.all([
    getScouterReceipt(matchId),
    getAdminSession(),
  ]);
  if (!receipt) notFound();

  const hostedAt = new Date(receipt.hostedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/players"
        className="mb-8 inline-flex text-xs font-black uppercase text-slate-500 transition hover:text-slate-200"
      >
        ← Players
      </Link>

      <header className="mb-8 rounded-2xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl shadow-black/30">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
          Scouter receipt
        </p>
        <h1 className="text-3xl font-black text-white">Match {receipt.id}</h1>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
          <span>Season: {receipt.seasonId}</span>
          <span>Games: {receipt.games.length}</span>
          <span>Hosted: {hostedAt}</span>
          <span>Discord host: {receipt.hostedByDiscordId}</span>
        </div>
      </header>

      <div className="space-y-6">
        {receipt.games.map((game) => (
          <section
            key={game.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-white">
                  Game {game.gameOrdinal} · {titleCase(game.winningSide)} won
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {game.gameMode ?? "Unknown mode"}
                  {game.smiteMatchId ? ` · ${game.smiteMatchId}` : ""}
                </p>
              </div>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                {game.participants.length} players
              </span>
              {adminSession ? (
                <Link
                  href={`/admin/scouters/${encodeURIComponent(game.id)}`}
                  className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase text-amber-100 transition hover:bg-amber-300/20"
                >
                  Correct game
                </Link>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/[0.03] text-[0.65rem] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Side</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">K / D / A</th>
                    <th className="px-4 py-3">Damage</th>
                    <th className="px-4 py-3">Wards</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {game.participants.map((participant) => (
                    <tr key={participant.id} className="text-slate-300">
                      <td className="px-4 py-3 font-bold capitalize">
                        {participant.side}
                      </td>
                      <td className="px-4 py-3 font-bold text-white">
                        {participant.playerId ? (
                          <Link
                            href={`/players/${encodeURIComponent(participant.playerId)}`}
                            className="transition hover:text-cyan-200"
                          >
                            {participant.rawIgn}
                          </Link>
                        ) : (
                          <span title="Unlinked IGN">{participant.rawIgn}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {participant.role ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {participant.kills} / {participant.deaths} /{" "}
                        {participant.assists}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {participant.playerDamage?.toLocaleString("en-US") ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {participant.wardsPlaced ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
