import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseJson } from "@/lib/database-json";
import {
  scouterExtractedGameSchema,
  type ScouterExtractedGame,
} from "@/lib/scouter-ocr";
import type { Database } from "@/types/database.types";

const draftStatusSchema = z.enum(["pending", "confirmed", "cancelled"]);

const identityDiagnosticSchema = z.object({
  index: z.number().int().nonnegative(),
  side: z.enum(["order", "chaos"]),
  rawIgn: z.string(),
  playerId: z.string().nullable(),
  identityStatus: z.enum(["linked", "duplicate", "unlinked", "ambiguous"]),
});

export const scouterDraftDiagnosticsSchema = z.object({
  participantCount: z.number().int(),
  duplicateIgns: z.array(z.string()),
  unlinkedIgns: z.array(z.string()),
  ambiguousIgns: z.array(z.string()),
  participants: z.array(identityDiagnosticSchema),
});

const draftResultSchema = z.object({
  code: z.enum(["created", "existing", "revised"]),
  applied: z.boolean(),
  draftId: z.string().min(1),
  revision: z.number().int().positive(),
  status: draftStatusSchema,
  game: scouterExtractedGameSchema,
  diagnostics: scouterDraftDiagnosticsSchema,
});

const cancelResultSchema = z.object({
  code: z.enum(["cancelled", "already_cancelled"]),
  applied: z.boolean(),
  draftId: z.string().min(1),
  revision: z.number().int().positive(),
  status: z.literal("cancelled"),
});

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

const confirmResultSchema = z.union([
  z.object({
    code: z.literal("already_confirmed"),
    applied: z.literal(false),
    draftId: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.literal("confirmed"),
    scouterMatchId: z.string().min(1),
    scouterGameId: z.string().min(1),
  }),
  z.object({
    code: z.enum(["inserted", "existing"]),
    applied: z.boolean(),
    draftId: z.string().min(1),
    revision: z.number().int().positive(),
    status: z.literal("confirmed"),
    scouterMatchId: z.string().min(1),
    scouterGameId: z.string().min(1),
    identityOverrideApplied: z.boolean(),
    participantsSummary: z.array(participantSummarySchema),
  }),
]);

export type ScouterDraftDiagnostics = z.infer<typeof scouterDraftDiagnosticsSchema>;
export type ScouterDraftResult = z.infer<typeof draftResultSchema>;
export type ScouterDraftCancelResult = z.infer<typeof cancelResultSchema>;
export type ScouterDraftConfirmResult = z.infer<typeof confirmResultSchema>;

export type ScouterDraftSnapshot = {
  draftId: string;
  revision: number;
  status: z.infer<typeof draftStatusSchema>;
  seasonId: string;
  hostedByDiscordId: string;
  scouterMatchId: string | null;
  gameOrdinal: number;
  scoreboardImagePath: string;
  detailsImagePath: string;
  game: ScouterExtractedGame;
  diagnostics: ScouterDraftDiagnostics;
};

export type CreateScouterDraftInput = {
  scoreboardImagePath: string;
  detailsImagePath: string;
  gameOrdinal: number;
  hostedByDiscordId: string;
  seasonId: string;
  scouterMatchId?: string;
  extracted: ScouterExtractedGame;
};

export async function createScouterGameDraft(
  client: SupabaseClient<Database>,
  input: CreateScouterDraftInput,
): Promise<ScouterDraftResult> {
  const { data, error } = await client.rpc("create_scouter_game_draft", {
    p_season_id: input.seasonId,
    p_hosted_by_discord_id: input.hostedByDiscordId,
    p_game_ordinal: input.gameOrdinal,
    p_scoreboard_image_path: input.scoreboardImagePath,
    p_details_image_path: input.detailsImagePath,
    p_extracted_game: toDatabaseJson(input.extracted),
    ...(input.scouterMatchId ? { p_scouter_match_id: input.scouterMatchId } : {}),
  });
  if (error) throw error;
  return parseResult(draftResultSchema, data, "create");
}

export async function getScouterGameDraft(
  client: SupabaseClient<Database>,
  draftId: string,
  hostedByDiscordId: string,
): Promise<ScouterDraftSnapshot> {
  const { data: row, error } = await client
    .from("scouter_game_drafts")
    .select(
      "id, revision, status, season_id, hosted_by_discord_id, scouter_match_id, game_ordinal, scoreboard_image_path, details_image_path, extracted_game, revised_game",
    )
    .eq("id", draftId)
    .eq("hosted_by_discord_id", hostedByDiscordId)
    .maybeSingle();
  if (error) throw error;
  if (!row) {
    throw Object.assign(new Error("Scouter draft not found."), { code: "P0002" });
  }

  const game = scouterExtractedGameSchema.parse(row.revised_game ?? row.extracted_game);
  const { data: diagnostics, error: diagnosticsError } = await client.rpc(
    "scouter_game_draft_diagnostics",
    { p_game: toDatabaseJson(game) },
  );
  if (diagnosticsError) throw diagnosticsError;

  return {
    draftId: row.id,
    revision: row.revision,
    status: draftStatusSchema.parse(row.status),
    seasonId: row.season_id,
    hostedByDiscordId: row.hosted_by_discord_id,
    scouterMatchId: row.scouter_match_id,
    gameOrdinal: row.game_ordinal,
    scoreboardImagePath: row.scoreboard_image_path,
    detailsImagePath: row.details_image_path,
    game,
    diagnostics: scouterDraftDiagnosticsSchema.parse(diagnostics),
  };
}

export async function reviseScouterGameDraft(
  client: SupabaseClient<Database>,
  input: {
    draftId: string;
    hostedByDiscordId: string;
    expectedRevision: number;
    game: ScouterExtractedGame;
  },
): Promise<ScouterDraftResult> {
  const { data, error } = await client.rpc("revise_scouter_game_draft", {
    p_draft_id: input.draftId,
    p_hosted_by_discord_id: input.hostedByDiscordId,
    p_expected_revision: input.expectedRevision,
    p_revised_game: toDatabaseJson(input.game),
  });
  if (error) throw error;
  return parseResult(draftResultSchema, data, "revise");
}

export async function cancelScouterGameDraft(
  client: SupabaseClient<Database>,
  draftId: string,
  hostedByDiscordId: string,
): Promise<ScouterDraftCancelResult> {
  const { data, error } = await client.rpc("cancel_scouter_game_draft", {
    p_draft_id: draftId,
    p_hosted_by_discord_id: hostedByDiscordId,
  });
  if (error) throw error;
  return parseResult(cancelResultSchema, data, "cancel");
}

export async function confirmScouterGameDraft(
  client: SupabaseClient<Database>,
  input: {
    draftId: string;
    hostedByDiscordId: string;
    expectedRevision: number;
    identityOverrideReason?: string;
  },
): Promise<ScouterDraftConfirmResult> {
  const { data, error } = await client.rpc("confirm_scouter_game_draft", {
    p_draft_id: input.draftId,
    p_hosted_by_discord_id: input.hostedByDiscordId,
    p_expected_revision: input.expectedRevision,
    ...(input.identityOverrideReason
      ? { p_identity_override_reason: input.identityOverrideReason }
      : {}),
  });
  if (error) throw error;
  return parseResult(confirmResultSchema, data, "confirm");
}

function parseResult<T>(schema: z.ZodType<T>, data: unknown, operation: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Scouter draft ${operation} returned an invalid database response.`);
  }
  return parsed.data;
}
