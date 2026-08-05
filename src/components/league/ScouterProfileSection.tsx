import Link from "next/link";
import type { ScouterProfile } from "@/lib/scouter-profile";

type Props = {
  playerId: string;
  profile: ScouterProfile;
};

type StatItem = {
  label: string;
  value: string | number;
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
              value: formatStat(profile.summary.averageDamage),
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

        {profile.summary.gamesPlayed > 0 && (
          <details className="mt-3 rounded-xl border border-white/8 bg-white/[0.02]">
            <summary className="cursor-pointer px-4 py-3 text-xs font-black uppercase tracking-wide text-cyan-100">
              Season averages
            </summary>
            <div className="grid gap-4 border-t border-white/8 p-4 md:grid-cols-3">
              <StatGroup
                title="Combat"
                items={[
                  {
                    label: "Damage taken",
                    value: formatStat(profile.summary.averageDamageTaken),
                  },
                  {
                    label: "Damage mitigated",
                    value: formatStat(profile.summary.averageDamageMitigated),
                  },
                  {
                    label: "Self healing",
                    value: formatStat(profile.summary.averageSelfHealing),
                  },
                  {
                    label: "Ally healing",
                    value: formatStat(profile.summary.averageAllyHealing),
                  },
                ]}
              />
              <StatGroup
                title="Economy & objectives"
                items={[
                  { label: "GPM", value: formatStat(profile.summary.averageGpm) },
                  {
                    label: "Structure damage",
                    value: formatStat(profile.summary.averageStructureDamage),
                  },
                  {
                    label: "Jungle damage",
                    value: formatStat(profile.summary.averageJungleDamage),
                  },
                  {
                    label: "Minion damage",
                    value: formatStat(profile.summary.averageMinionDamage),
                  },
                ]}
              />
              <StatGroup
                title="Utility"
                items={[
                  {
                    label: "Wards placed",
                    value: formatStat(profile.summary.averageWardsPlaced),
                  },
                ]}
              />
            </div>
          </details>
        )}
      </div>

      <div className="p-5">
        {profile.games.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-500">
            No scouter games recorded for {selectedSeasonName}.
          </div>
        ) : (
          <div className="space-y-3">
            {profile.games.map((game) => (
              <details
                key={game.id}
                className="group rounded-xl border border-white/8 bg-white/[0.02]"
              >
                <summary className="grid cursor-pointer list-none gap-3 p-4 text-xs sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div>
                    <p className="font-black text-white">
                      {game.godName ?? "Unknown god"}
                      <span className="font-medium capitalize text-slate-400">
                        {game.role ? ` · ${game.role}` : ""}
                      </span>
                    </p>
                    <p className="mt-1 text-slate-500">
                      {dateFormatter.format(new Date(game.hostedAt))} · {resultLabel(game.won)}
                    </p>
                  </div>
                  <p className="font-black text-white">
                    {game.kills} / {game.deaths} / {game.assists}
                    <span className="ml-1 font-medium text-slate-500">KDA</span>
                  </p>
                  <p className="font-black text-slate-300">
                    {formatStat(game.playerDamage)}
                    <span className="ml-1 font-medium text-slate-500">damage</span>
                  </p>
                </summary>

                <div className="border-t border-white/8 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[0.65rem] font-black uppercase tracking-wide text-cyan-200">
                      Full recorded line
                    </p>
                    <Link
                      href={`/scouters/${game.matchId}`}
                      className="font-mono text-xs font-bold text-cyan-300 transition hover:text-cyan-100"
                    >
                      {game.smiteMatchId ?? "View receipt"}
                    </Link>
                  </div>
                  <StatGrid
                    items={[
                      { label: "Recorded IGN", value: game.rawIgn },
                      { label: "Side", value: capitalize(game.side) },
                      { label: "God", value: game.godName ?? MISSING_STAT },
                      {
                        label: "Role",
                        value: game.role ? capitalize(game.role) : MISSING_STAT,
                      },
                      { label: "Player level", value: formatStat(game.playerLevel) },
                      {
                        label: "K / D / A",
                        value: `${game.kills} / ${game.deaths} / ${game.assists}`,
                      },
                      { label: "GPM", value: formatStat(game.gpm) },
                      { label: "Player damage", value: formatStat(game.playerDamage) },
                      { label: "Minion damage", value: formatStat(game.minionDamage) },
                      { label: "Jungle damage", value: formatStat(game.jungleDamage) },
                      { label: "Structure damage", value: formatStat(game.structureDamage) },
                      { label: "Damage taken", value: formatStat(game.damageTaken) },
                      { label: "Damage mitigated", value: formatStat(game.damageMitigated) },
                      { label: "Self healing", value: formatStat(game.selfHealing) },
                      { label: "Ally healing", value: formatStat(game.allyHealing) },
                      { label: "Wards placed", value: formatStat(game.wardsPlaced) },
                    ]}
                  />
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatGroup({ title, items }: { title: string; items: StatItem[] }) {
  return (
    <div>
      <h3 className="mb-2 text-[0.65rem] font-black uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <StatGrid items={items} compact />
    </div>
  );
}

function StatGrid({ items, compact = false }: { items: StatItem[]; compact?: boolean }) {
  return (
    <dl className={compact ? "space-y-1.5" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-4"}>
      {items.map((item) => (
        <div
          key={item.label}
          className={
            compact
              ? "flex items-center justify-between gap-3"
              : "rounded-lg border border-white/[0.06] bg-black/10 p-2.5"
          }
        >
          <dt className="text-[0.65rem] font-bold uppercase text-slate-500">
            {item.label}
          </dt>
          <dd className="font-black text-slate-200">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatStat(value: number | null): string {
  return value === null ? MISSING_STAT : value.toLocaleString("en-US");
}

const MISSING_STAT = "\u2014";

function resultLabel(won: boolean | null): string {
  if (won === null) return "Result unavailable";
  return won ? "Win" : "Loss";
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}
