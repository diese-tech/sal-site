import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/database.types";

export type ScouterProfileSeason = {
  id: string;
  name: string;
  status: string;
  startDate: string;
};

export type ScouterProfileGame = {
  id: string;
  matchId: string;
  seasonId: string;
  hostedAt: string;
  smiteMatchId: string | null;
  rawIgn: string;
  side: string;
  godName: string | null;
  role: string | null;
  playerLevel: number | null;
  kills: number;
  deaths: number;
  assists: number;
  gpm: number | null;
  playerDamage: number | null;
  minionDamage: number | null;
  jungleDamage: number | null;
  structureDamage: number | null;
  damageTaken: number | null;
  damageMitigated: number | null;
  selfHealing: number | null;
  allyHealing: number | null;
  wardsPlaced: number | null;
  won: boolean | null;
};

export type ScouterProfile = {
  selectedSeason: ScouterProfileSeason | null;
  availableSeasons: ScouterProfileSeason[];
  summary: {
    gamesPlayed: number;
    wins: number;
    losses: number;
    averageKda: number;
    averageDamage: number | null;
    averageGpm: number | null;
    averageMinionDamage: number | null;
    averageJungleDamage: number | null;
    averageStructureDamage: number | null;
    averageDamageTaken: number | null;
    averageDamageMitigated: number | null;
    averageSelfHealing: number | null;
    averageAllyHealing: number | null;
    averageWardsPlaced: number | null;
  };
  games: ScouterProfileGame[];
};

type ParticipantRow = {
  id: string;
  side: string;
  raw_ign: string;
  player_level: number | null;
  kills: number;
  deaths: number;
  assists: number;
  gpm: number | null;
  player_damage: number | null;
  minion_damage: number | null;
  jungle_damage: number | null;
  structure_damage: number | null;
  damage_taken: number | null;
  damage_mitigated: number | null;
  self_healing: number | null;
  ally_healing: number | null;
  wards_placed: number | null;
  role: string | null;
  god: { name: string } | null;
  game: {
    id: string;
    smite_match_id: string | null;
    winning_side: string | null;
    match: {
      id: string;
      season_id: string;
      hosted_at: string;
      season: {
        id: string;
        name: string;
        status: string;
        start_date: string;
      };
    };
  };
};

const EMPTY_SUMMARY: ScouterProfile["summary"] = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  averageKda: 0,
  averageDamage: null,
  averageGpm: null,
  averageMinionDamage: null,
  averageJungleDamage: null,
  averageStructureDamage: null,
  averageDamageTaken: null,
  averageDamageMitigated: null,
  averageSelfHealing: null,
  averageAllyHealing: null,
  averageWardsPlaced: null,
};

export async function getPlayerScouterProfile(
  playerId: string,
  requestedSeasonId?: string,
  client: SupabaseClient<Database> | null = getSupabaseServerClient(),
): Promise<ScouterProfile> {
  if (!client) {
    return {
      selectedSeason: null,
      availableSeasons: [],
      summary: EMPTY_SUMMARY,
      games: [],
    };
  }

  const [currentSeasonResult, participantsResult] = await Promise.all([
    client
      .from("seasons")
      .select("id, name, status, start_date")
      .in("status", ["active", "pre-season"])
      .eq("is_current", true)
      .maybeSingle(),
    client
      .from("scouter_game_participants")
      .select(
        `
        id, side, raw_ign, player_level, kills, deaths, assists, gpm,
        player_damage, minion_damage, jungle_damage, structure_damage,
        damage_taken, damage_mitigated, self_healing, ally_healing,
        wards_placed, role,
        god:gods(name),
        game:scouter_games!inner(
          id, smite_match_id, winning_side,
          match:scouter_matches!inner(
            id, season_id, hosted_at,
            season:seasons!inner(id, name, status, start_date)
          )
        )
      `,
      )
      .eq("player_id", playerId),
  ]);

  if (currentSeasonResult.error) throw currentSeasonResult.error;
  if (participantsResult.error) throw participantsResult.error;

  const currentSeason = currentSeasonResult.data
    ? toSeason(currentSeasonResult.data)
    : null;
  const rows = (participantsResult.data ?? []) as unknown as ParticipantRow[];
  const seasonsById = new Map<string, ScouterProfileSeason>();
  const allGames = rows.map((row): ScouterProfileGame => {
    const season = toSeason(row.game.match.season);
    seasonsById.set(season.id, season);
    const winningSide = row.game.winning_side;
    return {
      id: row.game.id,
      matchId: row.game.match.id,
      seasonId: row.game.match.season_id,
      hostedAt: row.game.match.hosted_at,
      smiteMatchId: row.game.smite_match_id,
      rawIgn: row.raw_ign,
      side: row.side,
      godName: row.god?.name ?? null,
      role: row.role,
      playerLevel: row.player_level,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      gpm: row.gpm,
      playerDamage: row.player_damage,
      minionDamage: row.minion_damage,
      jungleDamage: row.jungle_damage,
      structureDamage: row.structure_damage,
      damageTaken: row.damage_taken,
      damageMitigated: row.damage_mitigated,
      selfHealing: row.self_healing,
      allyHealing: row.ally_healing,
      wardsPlaced: row.wards_placed,
      won: winningSide === null ? null : winningSide === row.side,
    };
  });

  const availableSeasons = [...seasonsById.values()].sort((left, right) =>
    right.startDate.localeCompare(left.startDate),
  );
  const requestedSeason = requestedSeasonId
    ? (seasonsById.get(requestedSeasonId) ?? null)
    : null;
  const selectedSeason =
    requestedSeason ?? currentSeason ?? availableSeasons[0] ?? null;
  const games = selectedSeason
    ? allGames
        .filter((game) => game.seasonId === selectedSeason.id)
        .sort((left, right) => right.hostedAt.localeCompare(left.hostedAt))
    : [];

  return {
    selectedSeason,
    availableSeasons,
    summary: summarizeGames(games),
    games,
  };
}

function summarizeGames(
  games: ScouterProfileGame[],
): ScouterProfile["summary"] {
  if (games.length === 0) return EMPTY_SUMMARY;

  const wins = games.filter((game) => game.won === true).length;
  const losses = games.filter((game) => game.won === false).length;
  const averageKda =
    games.reduce(
      (total, game) =>
        total + (game.kills + game.assists) / Math.max(game.deaths, 1),
      0,
    ) / games.length;

  return {
    gamesPlayed: games.length,
    wins,
    losses,
    averageKda: Number(averageKda.toFixed(2)),
    averageDamage: averageRecorded(games, (game) => game.playerDamage),
    averageGpm: averageRecorded(games, (game) => game.gpm),
    averageMinionDamage: averageRecorded(games, (game) => game.minionDamage),
    averageJungleDamage: averageRecorded(games, (game) => game.jungleDamage),
    averageStructureDamage: averageRecorded(
      games,
      (game) => game.structureDamage,
    ),
    averageDamageTaken: averageRecorded(games, (game) => game.damageTaken),
    averageDamageMitigated: averageRecorded(
      games,
      (game) => game.damageMitigated,
    ),
    averageSelfHealing: averageRecorded(games, (game) => game.selfHealing),
    averageAllyHealing: averageRecorded(games, (game) => game.allyHealing),
    averageWardsPlaced: averageRecorded(games, (game) => game.wardsPlaced),
  };
}

function averageRecorded(
  games: ScouterProfileGame[],
  select: (game: ScouterProfileGame) => number | null,
): number | null {
  const recorded = games
    .map(select)
    .filter((value): value is number => value !== null);
  if (recorded.length === 0) return null;
  return Math.round(
    recorded.reduce((total, value) => total + value, 0) / recorded.length,
  );
}

function toSeason(row: {
  id: string;
  name: string;
  status: string;
  start_date: string;
}): ScouterProfileSeason {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    startDate: row.start_date,
  };
}
