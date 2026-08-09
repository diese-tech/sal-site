import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const mergeOrgIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tag: z.string().min(1),
  divisionId: z.string().min(1),
});

const mergeCountsSchema = z.record(z.string(), z.number().int().nonnegative());

export const organizationMergePreviewSchema = z.object({
  source: mergeOrgIdentitySchema.nullable(),
  target: mergeOrgIdentitySchema.nullable(),
  counts: mergeCountsSchema,
  blockers: z.array(z.string().min(1)),
  canMerge: z.boolean(),
});

export type OrganizationMergePreview = z.infer<typeof organizationMergePreviewSchema>;

const organizationMergeResultSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("merged"),
    applied: z.literal(true),
    sourceOrganizationId: z.string().min(1),
    targetOrganizationId: z.string().min(1),
    source: mergeOrgIdentitySchema,
    target: mergeOrgIdentitySchema,
    counts: mergeCountsSchema,
  }),
  z.object({
    code: z.literal("already_merged"),
    applied: z.literal(false),
    sourceOrganizationId: z.string().min(1),
    targetOrganizationId: z.string().min(1),
  }),
]);

export type OrganizationMergeResult = z.infer<typeof organizationMergeResultSchema>;

export class OrganizationMergeContractError extends Error {}

function requireClient() {
  const client = getSupabaseServerClient();
  if (!client) throw new Error("Supabase env is missing.");
  return client;
}

export async function previewOrganizationMerge(
  sourceOrgId: string,
  targetOrgId: string,
): Promise<OrganizationMergePreview> {
  const { data, error } = await requireClient().rpc("preview_organization_merge", {
    p_source_org_id: sourceOrgId,
    p_target_org_id: targetOrgId,
  });
  if (error) throw error;
  const parsed = organizationMergePreviewSchema.safeParse(data);
  if (!parsed.success) {
    throw new OrganizationMergeContractError("Organization merge preview returned an invalid database response.");
  }
  return parsed.data;
}

export async function applyOrganizationMerge(input: {
  sourceOrgId: string;
  targetOrgId: string;
  actorDiscordId: string;
}): Promise<OrganizationMergeResult> {
  const { data, error } = await requireClient().rpc("merge_organization", {
    p_source_org_id: input.sourceOrgId,
    p_target_org_id: input.targetOrgId,
    p_actor_discord_id: input.actorDiscordId,
  });
  if (error) throw error;
  const parsed = organizationMergeResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new OrganizationMergeContractError("Organization merge returned an invalid database response.");
  }
  return parsed.data;
}
