import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/database.types";

export type PublicScouterReceipt = {
  id: string;
  seasonId: string;
  hostedByDiscordId: string;
  hostedAt: string;
  games: Array<{
    id: string;
    gameOrdinal: number;
    smiteMatchId: string | null;
    gameMode: string | null;
    winningSide: string | null;
    matchLengthSeconds: number | null;
    participants: Array<{
      id: string;
      side: string;
      rawIgn: string;
      playerId: string | null;
      role: string | null;
      kills: number;
      deaths: number;
      assists: number;
      playerDamage: number | null;
      wardsPlaced: number | null;
    }>;
  }>;
};

type ScouterReceiptRow = {
  id: string;
  season_id: string;
  hosted_by_discord_id: string;
  hosted_at: string;
  games: Array<{
    id: string;
    game_ordinal: number;
    smite_match_id: string | null;
    game_mode: string | null;
    winning_side: string | null;
    match_length_seconds: number | null;
    participants: Array<{
      id: string;
      side: string;
      raw_ign: string;
      player_id: string | null;
      role: string | null;
      kills: number;
      deaths: number;
      assists: number;
      player_damage: number | null;
      wards_placed: number | null;
    }>;
  }>;
};

export async function getScouterReceipt(
  matchId: string,
  client: SupabaseClient<Database> | null = getSupabaseServerClient(),
): Promise<PublicScouterReceipt | null> {
  if (!client) return null;

  const { data, error } = await client
    .from("scouter_matches")
    .select(`
      id, season_id, hosted_by_discord_id, hosted_at,
      games:scouter_games(
        id, game_ordinal, smite_match_id, game_mode, winning_side,
        match_length_seconds,
        participants:scouter_game_participants(
          id, side, raw_ign, player_id, role, kills, deaths, assists,
          player_damage, wards_placed
        )
      )
    `)
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as ScouterReceiptRow;
  return {
    id: row.id,
    seasonId: row.season_id,
    hostedByDiscordId: row.hosted_by_discord_id,
    hostedAt: row.hosted_at,
    games: row.games
      .map((game) => ({
        id: game.id,
        gameOrdinal: game.game_ordinal,
        smiteMatchId: game.smite_match_id,
        gameMode: game.game_mode,
        winningSide: game.winning_side,
        matchLengthSeconds: game.match_length_seconds,
        participants: game.participants.map((participant) => ({
          id: participant.id,
          side: participant.side,
          rawIgn: participant.raw_ign,
          playerId: participant.player_id,
          role: participant.role,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          playerDamage: participant.player_damage,
          wardsPlaced: participant.wards_placed,
        })),
      }))
      .sort((left, right) => left.gameOrdinal - right.gameOrdinal),
  };
}
