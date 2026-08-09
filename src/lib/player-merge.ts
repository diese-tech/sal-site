import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const nullableId = z.string().min(1).nullable();

const playerMergeIdentitySchema = z.object({
  id: z.string().min(1),
  ign: z.string().min(1),
  discordUsername: z.string(),
  orgId: nullableId,
  divisionId: nullableId,
  status: z.string().min(1),
  isCaptain: z.boolean(),
  isStarter: z.boolean(),
  profileClaimed: z.boolean(),
  hasDiscordId: z.boolean(),
  archivedAt: z.string().nullable(),
});

const mergeCountsSchema = z.record(z.string(), z.number().int().nonnegative());

export const playerMergePreviewSchema = z.object({
  source: playerMergeIdentitySchema.nullable(),
  target: playerMergeIdentitySchema.nullable(),
  counts: mergeCountsSchema,
  blockers: z.array(z.string().min(1)),
  blockerCodes: z.array(z.string().min(1)),
  canMerge: z.boolean(),
});

export type PlayerMergeIdentity = z.infer<typeof playerMergeIdentitySchema>;
export type PlayerMergePreview = z.infer<typeof playerMergePreviewSchema>;

const playerMergeResultSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("merged"),
    applied: z.literal(true),
    sourcePlayerId: z.string().min(1),
    targetPlayerId: z.string().min(1),
    source: playerMergeIdentitySchema,
    target: playerMergeIdentitySchema,
    counts: mergeCountsSchema,
  }),
  z.object({
    code: z.literal("already_merged"),
    applied: z.literal(false),
    sourcePlayerId: z.string().min(1),
    targetPlayerId: z.string().min(1),
  }),
]);

export type PlayerMergeResult = z.infer<typeof playerMergeResultSchema>;

export class PlayerMergeContractError extends Error {}

type PlayerMergeRpcResult = PromiseLike<{
  data: unknown;
  error: unknown;
}>;

interface PlayerMergeRpcClient {
  rpc(
    name: "preview_player_merge",
    args: { p_source_player_id: string; p_target_player_id: string },
  ): PlayerMergeRpcResult;
  rpc(
    name: "merge_player",
    args: {
      p_source_player_id: string;
      p_target_player_id: string;
      p_actor_discord_id: string;
    },
  ): PlayerMergeRpcResult;
}

// Keep the additive RPC boundary isolated until the next immutable database
// release regenerates the site's pinned Supabase types.
function requireClient(): PlayerMergeRpcClient {
  const client = getSupabaseServerClient();
  if (!client) throw new Error("Supabase env is missing.");
  return client as unknown as PlayerMergeRpcClient;
}

export async function previewPlayerMerge(
  sourcePlayerId: string,
  targetPlayerId: string,
): Promise<PlayerMergePreview> {
  const { data, error } = await requireClient().rpc("preview_player_merge", {
    p_source_player_id: sourcePlayerId,
    p_target_player_id: targetPlayerId,
  });
  if (error) throw error;
  const parsed = playerMergePreviewSchema.safeParse(data);
  if (!parsed.success) {
    throw new PlayerMergeContractError("Player merge preview returned an invalid database response.");
  }
  if (
    (parsed.data.source && parsed.data.source.id !== sourcePlayerId)
    || (parsed.data.target && parsed.data.target.id !== targetPlayerId)
    || (parsed.data.canMerge && (!parsed.data.source || !parsed.data.target))
  ) {
    throw new PlayerMergeContractError("Player merge preview returned identities that do not match the request.");
  }
  return parsed.data;
}

export async function applyPlayerMerge(input: {
  sourcePlayerId: string;
  targetPlayerId: string;
  actorDiscordId: string;
}): Promise<PlayerMergeResult> {
  const { data, error } = await requireClient().rpc("merge_player", {
    p_source_player_id: input.sourcePlayerId,
    p_target_player_id: input.targetPlayerId,
    p_actor_discord_id: input.actorDiscordId,
  });
  if (error) throw error;
  const parsed = playerMergeResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new PlayerMergeContractError("Player merge returned an invalid database response.");
  }
  if (
    parsed.data.sourcePlayerId !== input.sourcePlayerId
    || parsed.data.targetPlayerId !== input.targetPlayerId
    || (parsed.data.code === "merged" && (
      parsed.data.source.id !== input.sourcePlayerId
      || parsed.data.target.id !== input.targetPlayerId
    ))
  ) {
    throw new PlayerMergeContractError("Player merge returned identities that do not match the request.");
  }
  return parsed.data;
}
