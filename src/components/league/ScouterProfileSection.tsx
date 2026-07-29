import Link from "next/link";
import type { ScouterProfile } from "@/lib/scouter-profile";

type Props = {
  playerId: string;
  profile: ScouterProfile;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function ScouterProfileSection({ playerId, profile }: Props) {
  const selectedSeasonName = profile.selectedSeason?.name ?? "Scouters";
  const selectedSeasonIsAvailable = profile.availableSeasons.some(
    (season) => season.id === profile.selectedSeason?.id,
  );

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/70">
      <div className="border-b border-white/8 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-widest text-cyan-200">
              Scouter Stats
            </p>
            <h2 className="mt-1 text-lg font-black text-white">
              {selectedSeasonName}
            </h2>
          </div>

          {(profile.availableSeasons.length > 1 ||
            (!selectedSeasonIsAvailable &&
              profile.availableSeasons.length > 0)) && (
            <form
              action={`/players/${encodeURIComponent(playerId)}`}
              method="get"
              className="flex items-center gap-2"
            >
              <label
                htmlFor="scouter-season"
                className="text-[0.65rem] font-black uppercase text-slate-500"
              >
                Season
              </label>
              <select
                id="scouter-season"
                name="season"
                defaultValue={profile.selectedSeason?.id}
                className="rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-200"
              >
                {!selectedSeasonIsAvailable && profile.selectedSeason && (
                  <option value={profile.selectedSeason.id}>
                    {profile.selectedSeason.name} (no games)
                  </option>
                )}
                {profile.availableSeasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-black uppercase text-cyan-100 transition hover:bg-cyan-300/20"
              >
                View
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Games", value: profile.summary.gamesPlayed },
            {
              label: "W-L",
              value: `${profile.summary.wins}-${profile.summary.losses}`,
            },
            { label: "Avg KDA", value: profile.summary.averageKda.toFixed(2) },
            {
              label: "Avg Damage",
              value: profile.summary.averageDamage.toLocaleString("en-US"),
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-center"
            >
              <p className="text-xl font-black text-white">{value}</p>
              <p className="mt-0.5 text-[0.6rem] font-black uppercase text-slate-500">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5">
        {profile.games.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-500">
            No scouter games recorded for {selectedSeasonName}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-xs">
              <thead>
                <tr className="border-b border-white/8">
                  {[
                    "Date",
                    "SMITE ID",
                    "God",
                    "Role",
                    "K / D / A",
                    "Damage",
                    "Wards",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="pb-2 pr-3 text-left font-black uppercase text-slate-500 last:pr-0 last:text-right"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {profile.games.map((game) => (
                  <tr key={game.id} className="hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap py-2 pr-3 font-black text-slate-400">
                      {dateFormatter.format(new Date(game.hostedAt))}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/scouters/${game.matchId}`}
                        className="font-mono font-bold text-cyan-300 transition hover:text-cyan-100"
                      >
                        {game.smiteMatchId ?? "Receipt"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 font-black text-slate-200">
                      {game.godName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 capitalize text-slate-300">
                      {game.role ?? "—"}
                    </td>
                    <td className="py-2 pr-3 font-black text-white">
                      {game.kills} / {game.deaths} / {game.assists}
                    </td>
                    <td className="py-2 pr-3 text-right font-black text-slate-300">
                      {game.playerDamage?.toLocaleString("en-US") ?? "—"}
                    </td>
                    <td className="py-2 text-right font-black text-slate-300">
                      {game.wardsPlaced ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
