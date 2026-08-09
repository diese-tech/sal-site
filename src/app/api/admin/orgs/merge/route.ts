import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestSession, type AdminSessionPayload } from "@/lib/admin-auth";
import { errorMessage, reportError } from "@/lib/error-monitor";
import { recalculateAndPersistStandings } from "@/lib/league-data";
import {
  applyOrganizationMerge,
  OrganizationMergeContractError,
  previewOrganizationMerge,
  type OrganizationMergePreview,
  type OrganizationMergeResult,
} from "@/lib/organization-merge";

const orgPairSchema = z.object({
  sourceOrgId: z.string().trim().min(1),
  targetOrgId: z.string().trim().min(1),
}).refine((body) => body.sourceOrgId !== body.targetOrgId, {
  message: "Source and target organizations must be different.",
});

const requestSchema = z.discriminatedUnion("action", [
  orgPairSchema.extend({ action: z.literal("preview") }),
  orgPairSchema.extend({ action: z.literal("apply"), confirmation: z.literal("MERGE") }),
]);

interface OrganizationMergeHandlerDependencies {
  getSession: (request: NextRequest) => Pick<AdminSessionPayload, "discordId" | "role"> | null;
  previewMerge: (sourceOrgId: string, targetOrgId: string) => Promise<OrganizationMergePreview>;
  applyMerge: (input: {
    sourceOrgId: string;
    targetOrgId: string;
    actorDiscordId: string;
  }) => Promise<OrganizationMergeResult>;
  recalculateStandings: () => Promise<unknown>;
  revalidateLeagueData: () => void;
}

function databaseStatus(error: unknown): number {
  if (error instanceof OrganizationMergeContractError) return 502;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "42501") return 403;
  if (["23514", "23505", "40001"].includes(code)) return 409;
  return 500;
}

export function createOrganizationMergeHandler(deps: OrganizationMergeHandlerDependencies) {
  return async function organizationMergeHandler(request: NextRequest) {
    const session = deps.getSession(request);
    if (session?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized. Superadmin required." }, { status: 403 });
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
      }, { status: 400 });
    }

    try {
      if (parsed.data.action === "preview") {
        const preview = await deps.previewMerge(parsed.data.sourceOrgId, parsed.data.targetOrgId);
        return NextResponse.json({ ok: true, preview });
      }

      const result = await deps.applyMerge({
        sourceOrgId: parsed.data.sourceOrgId,
        targetOrgId: parsed.data.targetOrgId,
        actorDiscordId: session.discordId,
      });
      let warning: string | null = null;
      try {
        await deps.recalculateStandings();
      } catch (standingsError) {
        reportError("Organization merge standings recalculation failed", standingsError, {
          sourceOrgId: parsed.data.sourceOrgId,
          targetOrgId: parsed.data.targetOrgId,
        });
        warning = "Organizations were merged, but standings could not be recalculated.";
      }
      deps.revalidateLeagueData();
      return NextResponse.json({ ok: true, ...result, warning });
    } catch (error) {
      reportError("POST /api/admin/orgs/merge", error, {
        sourceOrgId: parsed.data.sourceOrgId,
        targetOrgId: parsed.data.targetOrgId,
        action: parsed.data.action,
      });
      return NextResponse.json({
        error: errorMessage(error, "Unable to merge organizations."),
      }, { status: databaseStatus(error) });
    }
  };
}

export const POST = createOrganizationMergeHandler({
  getSession: getAdminRequestSession,
  previewMerge: previewOrganizationMerge,
  applyMerge: applyOrganizationMerge,
  recalculateStandings: recalculateAndPersistStandings,
  revalidateLeagueData: () => revalidateTag("league-data", {}),
});
