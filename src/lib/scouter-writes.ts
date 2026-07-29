import { z } from "zod";
import type { ScouterExtractedGame } from "@/lib/scouter-ocr";
import type { Database } from "@/types/database.types";

const participantSummarySchema = z.object({
  id: z.string(),
  side: z.enum(["order", "chaos"]),
  rawIgn: z.string(),
  playerId: z.string().nullable(),
  godId: z.string().nullable(),
  role: z.string().nullable(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  playerDamage: z.number().int().nonnegative().nullable(),
  wardsPlaced: z.number().int().nonnegative().nullable(),
});

const writeResultSchema = z.object({
  code: z.enum(["inserted", "existing"]),
  applied: z.boolean(),
  scouterMatchId: z.string().min(1),
  scouterGameId: z.string().min(1),
  participantsSummary: z.array(participantSummarySchema),
});

export type ScouterWriteResult = z.infer<typeof writeResultSchema>;

export interface ScouterWriteInput {
  scoreboardImagePath: string;
  detailsImagePath: string;
  gameOrdinal: number;
  hostedByDiscordId: string;
  seasonId: string;
  scouterMatchId?: string;
  extracted: ScouterExtractedGame;
}

type ScouterIngestRpcArgs = Database["public"]["Functions"]["ingest_scouter_game"]["Args"];

interface ScouterRpcDependencies {
  rpc: (name: "ingest_scouter_game", args: ScouterIngestRpcArgs) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

export async function writeScouterGame(
  input: ScouterWriteInput,
  dependencies: ScouterRpcDependencies,
): Promise<ScouterWriteResult> {
  const { data, error } = await dependencies.rpc("ingest_scouter_game", {
    p_season_id: input.seasonId,
    p_hosted_by_discord_id: input.hostedByDiscordId,
    p_game_ordinal: input.gameOrdinal,
    p_scoreboard_image_path: input.scoreboardImagePath,
    p_details_image_path: input.detailsImagePath,
    p_participants: input.extracted.participants,
    p_winning_side: input.extracted.winningSide,
    ...(input.scouterMatchId
      ? { p_scouter_match_id: input.scouterMatchId }
      : {}),
    ...(input.extracted.smiteMatchId
      ? { p_smite_match_id: input.extracted.smiteMatchId }
      : {}),
    ...(input.extracted.gameMode
      ? { p_game_mode: input.extracted.gameMode }
      : {}),
    ...(input.extracted.matchLengthSeconds !== null
      ? { p_match_length_seconds: input.extracted.matchLengthSeconds }
      : {}),
  });
  if (error) throw error;

  const result = writeResultSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Scouter ingest returned an invalid database response.");
  }
  return result.data;
}
