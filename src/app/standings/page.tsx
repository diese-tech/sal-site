import { StandingsTable } from "@/components/league/StandingsTable";
import { SeasonSelector } from "@/components/league/SeasonSelector";
import { getLeagueData, getAllSeasons } from "@/lib/league-data";

export const metadata = {
  title: "Standings - Serpent Ascension League",
};

export const revalidate = 30;

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonId } = await searchParams;
  const { divisions, standings, orgs, season } = await getLeagueData(seasonId);
  const allSeasons = await getAllSeasons();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/84 shadow-2xl shadow-cyan-950/20 backdrop-blur">
        <div className="h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-blue-500" />
        <div className="p-5">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-200">League Standings</p>
          <h1 className="mt-2 text-2xl font-black leading-tight text-white">
            {season.name} · Week {season.currentWeek}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm font-semibold text-slate-400">
            Official league points, records, and recent form across Solar, Lunar, and Terra divisions. Click any team to view their roster.
          </p>
          {allSeasons.length > 1 && (
            <SeasonSelector seasons={allSeasons} currentSeasonId={season.id} />
          )}
        </div>
      </div>

      <StandingsTable divisions={divisions} standings={standings} orgs={orgs} />

      <div className="mt-5 flex flex-wrap gap-4 text-[0.65rem] font-bold uppercase text-slate-600">
        <span>W - Wins</span>
        <span>L - Losses</span>
        <span>D - Draws</span>
        <span>Pts - League points</span>
        <span>Last 5 - Recent form</span>
      </div>
      <p className="mt-2 text-[0.65rem] font-bold uppercase text-slate-600">
        Scoring: 2-0 win = 3 pts · 2-1 win = 2 pts · 1-2 loss = 1 pt · 0-2 loss = 0 pts. A 2-0 forfeit awards 3 pts.
      </p>
      <p className="mt-1 text-[0.65rem] font-bold uppercase text-slate-600">
        Draws are recorded; their league-point value is pending a council ruling.
      </p>
    </main>
  );
}
