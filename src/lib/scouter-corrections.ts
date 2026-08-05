import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/database.types";

const nonnegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const nullableStat = nonnegativeInteger.nullable();

export const scouterCorrectionParticipantSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    side: z.enum(["order", "chaos"]),
    rawIgn: z.string().trim().min(1).max(64),
    playerId: z.string().trim().min(1).max(200).nullable(),
    godId: z.string().trim().min(1).max(200).nullable(),
    role: z.enum(["solo", "jungle", "mid", "support", "carry"]).nullable(),
    playerLevel: z.number().int().min(1).max(20).nullable(),
    kills: nonnegativeInteger,
    deaths: nonnegativeInteger,
    assists: nonnegativeInteger,
    gpm: nullableStat,
    playerDamage: nullableStat,
    minionDamage: nullableStat,
    jungleDamage: nullableStat,
    structureDamage: nullableStat,
    damageTaken: nullableStat,
    damageMitigated: nullableStat,
    selfHealing: nullableStat,
    allyHealing: nullableStat,
    wardsPlaced: nullableStat,
  })
  .strict();

export const scouterCorrectionGameSchema = z
  .object({
    smiteMatchId: z.string().trim().min(1).max(200).nullable(),
    gameMode: z.string().trim().min(1).max(100).nullable(),
    winningSide: z.enum(["order", "chaos"]),
    matchLengthSeconds: nullableStat,
    participants: z.array(scouterCorrectionParticipantSchema).length(10),
  })
  .strict()
  .superRefine((game, context) => {
    const ids = new Set<string>();
    const igns = new Set<string>();
    let order = 0;
    let chaos = 0;

    for (const [index, participant] of game.participants.entries()) {
      const normalizedIgn = participant.rawIgn.toLocaleLowerCase("en-US");
      if (ids.has(participant.id)) {
        context.addIssue({
          code: "custom",
          path: ["participants", index, "id"],
          message: "Participant IDs must be unique.",
        });
      }
      if (igns.has(normalizedIgn)) {
        context.addIssue({
          code: "custom",
          path: ["participants", index, "rawIgn"],
          message: "Player names must be unique within the game.",
        });
      }
      ids.add(participant.id);
      igns.add(normalizedIgn);
      if (participant.side === "order") order += 1;
      else chaos += 1;
    }

    if (order !== 5 || chaos !== 5) {
      context.addIssue({
        code: "custom",
        path: ["participants"],
        message: "A correction must contain five Order and five Chaos players.",
      });
    }
  });

export const scouterCorrectionRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    correctionKey: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(1000),
    game: scouterCorrectionGameSchema,
  })
  .strict();

export const scouterCorrectionResultSchema = z.object({
  code: z.enum(["corrected", "already_applied"]),
  applied: z.boolean(),
  correctionId: z.string().min(1),
  scouterGameId: z.string().min(1),
  revision: z.number().int().positive(),
});

export type ScouterCorrectionGame = z.infer<typeof scouterCorrectionGameSchema>;
export type ScouterCorrectionRequest = z.infer<typeof scouterCorrectionRequestSchema>;
export type ScouterCorrectionResult = z.infer<typeof scouterCorrectionResultSchema>;

export type ScouterGameCorrectionSnapshot = {
  id: string;
  matchId: string;
  gameOrdinal: number;
  revision: number;
  scoreboardImageUrl: string;
  detailsImageUrl: string;
  game: ScouterCorrectionGame;
  players: Array<{
    id: string;
    ign: string;
    discordUsername: string;
    status: string;
  }>;
  gods: Array<{ id: string; name: string }>;
};

type RawParticipant = {
  id: string;
  side: string;
  raw_ign: string;
  player_id: string | null;
  god_id: string | null;
  role: string | null;
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
};

type RawGame = {
  id: string;
  scouter_match_id: string;
  game_ordinal: number;
  revision: number;
  smite_match_id: string | null;
  game_mode: string | null;
  winning_side: string | null;
  match_length_seconds: number | null;
  scoreboard_image_path: string;
  details_image_path: string;
  participants: RawParticipant[];
};

type RawPlayer = {
  id: string;
  ign: string;
  discord_username: string;
  status: string;
};

type RawGod = { id: string; name: string };

export function parseScouterGameCorrectionSnapshot(
  row: RawGame,
  players: RawPlayer[],
  gods: RawGod[],
  imageUrls: { scoreboard: string; details: string },
): ScouterGameCorrectionSnapshot {
  const participants = row.participants
    .map((participant) => ({
      id: participant.id,
      side: participant.side,
      rawIgn: participant.raw_ign,
      playerId: participant.player_id,
      godId: participant.god_id,
      role: participant.role,
      playerLevel: participant.player_level,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      gpm: participant.gpm,
      playerDamage: participant.player_damage,
      minionDamage: participant.minion_damage,
      jungleDamage: participant.jungle_damage,
      structureDamage: participant.structure_damage,
      damageTaken: participant.damage_taken,
      damageMitigated: participant.damage_mitigated,
      selfHealing: participant.self_healing,
      allyHealing: participant.ally_healing,
      wardsPlaced: participant.wards_placed,
    }))
    .sort((left, right) => {
      if (left.side !== right.side) return left.side === "order" ? -1 : 1;
      return left.rawIgn.localeCompare(right.rawIgn);
    });

  return {
    id: row.id,
    matchId: row.scouter_match_id,
    gameOrdinal: row.game_ordinal,
    revision: row.revision,
    scoreboardImageUrl: imageUrls.scoreboard,
    detailsImageUrl: imageUrls.details,
    game: scouterCorrectionGameSchema.parse({
      smiteMatchId: row.smite_match_id,
      gameMode: row.game_mode,
      winningSide: row.winning_side,
      matchLengthSeconds: row.match_length_seconds,
      participants,
    }),
    players: players
      .map((player) => ({
        id: player.id,
        ign: player.ign,
        discordUsername: player.discord_username,
        status: player.status,
      }))
      .sort((left, right) => left.ign.localeCompare(right.ign)),
    gods: [...gods].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function getScouterGameCorrectionSnapshot(
  gameId: string,
  client: SupabaseClient<Database> | null = getSupabaseServerClient(),
): Promise<ScouterGameCorrectionSnapshot | null> {
  if (!client) return null;

  const [{ data: gameData, error: gameError }, playersResult, godsResult] =
    await Promise.all([
      client
        .from("scouter_games")
        .select(`
          id, scouter_match_id, game_ordinal, revision, smite_match_id,
          game_mode, winning_side, match_length_seconds,
          scoreboard_image_path, details_image_path,
          participants:scouter_game_participants(
            id, side, raw_ign, player_id, god_id, role, player_level,
            kills, deaths, assists, gpm, player_damage, minion_damage,
            jungle_damage, structure_damage, damage_taken, damage_mitigated,
            self_healing, ally_healing, wards_placed
          )
        `)
        .eq("id", gameId)
        .maybeSingle(),
      client.from("players").select("id, ign, discord_username, status"),
      client.from("gods").select("id, name"),
    ]);

  if (gameError) throw gameError;
  if (playersResult.error) throw playersResult.error;
  if (godsResult.error) throw godsResult.error;
  if (!gameData) return null;

  const game = gameData as unknown as RawGame;
  const [scoreboard, details] = await Promise.all([
    client.storage
      .from("match-screenshots")
      .createSignedUrl(game.scoreboard_image_path, 60 * 60),
    client.storage
      .from("match-screenshots")
      .createSignedUrl(game.details_image_path, 60 * 60),
  ]);
  if (scoreboard.error) throw scoreboard.error;
  if (details.error) throw details.error;

  return parseScouterGameCorrectionSnapshot(
    game,
    (playersResult.data ?? []) as RawPlayer[],
    (godsResult.data ?? []) as RawGod[],
    { scoreboard: scoreboard.data.signedUrl, details: details.data.signedUrl },
  );
}

export async function correctScouterGame(
  client: SupabaseClient<Database>,
  gameId: string,
  actorDiscordId: string,
  input: ScouterCorrectionRequest,
): Promise<ScouterCorrectionResult> {
  const { data, error } = await client.rpc("correct_scouter_game", {
    p_scouter_game_id: gameId,
    p_actor_discord_id: actorDiscordId,
    p_expected_revision: input.expectedRevision,
    p_correction_key: input.correctionKey,
    p_reason: input.reason,
    p_game: input.game,
  });
  if (error) throw error;

  const parsed = scouterCorrectionResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Scouter correction returned an invalid database response.");
  }
  return parsed.data;
}
