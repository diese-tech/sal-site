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
  godName: string | null;
  role: string | null;
  kills: number;
  deaths: number;
  assists: number;
  playerDamage: number | null;
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
    averageDamage: number;
  };
  games: ScouterProfileGame[];
};

type ParticipantRow = {
  id: string;
  side: string;
  kills: number;
  deaths: number;
  assists: number;
  player_damage: number | null;
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
  averageDamage: 0,
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
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("scouter_game_participants")
      .select(
        `
        id, side, kills, deaths, assists, player_damage, wards_placed, role,
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
      godName: row.god?.name ?? null,
      role: row.role,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      playerDamage: row.player_damage,
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
  const damageGames = games.filter((game) => game.playerDamage !== null);
  const averageDamage =
    damageGames.length > 0
      ? damageGames.reduce(
          (total, game) => total + (game.playerDamage ?? 0),
          0,
        ) / damageGames.length
      : 0;

  return {
    gamesPlayed: games.length,
    wins,
    losses,
    averageKda: Number(averageKda.toFixed(2)),
    averageDamage: Math.round(averageDamage),
  };
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
