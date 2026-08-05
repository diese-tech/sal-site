import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInternalServiceRequest } from "@/lib/admin-auth";
import {
  cancelScouterGameDraft,
  type ScouterDraftCancelResult,
} from "@/lib/scouter-drafts";
import { requireScouterSupabase, scouterDraftError } from "@/lib/scouter-draft-http";

type RouteContext = { params: Promise<{ draftId: string }> };
const requestSchema = z.object({
  hosted_by_discord_id: z.string().trim().min(1).max(128),
});

interface CancelDependencies {
  isAuthorized: (request: NextRequest) => boolean;
  cancelDraft: (draftId: string, hostedByDiscordId: string) => Promise<ScouterDraftCancelResult>;
}

export function createScouterDraftCancelHandler(dependencies: CancelDependencies) {
  return async function POST(request: NextRequest, context: RouteContext) {
    if (!dependencies.isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "hosted_by_discord_id is required." }, { status: 400 });
    }
    const { draftId } = await context.params;
    try {
      const result = await dependencies.cancelDraft(draftId, parsed.data.hosted_by_discord_id);
      return NextResponse.json({
        code: result.code,
        applied: result.applied,
        draft_id: result.draftId,
        revision: result.revision,
        status: result.status,
      });
    } catch (error) {
      return scouterDraftError("cancel", error, { draftId });
    }
  };
}

export const POST = createScouterDraftCancelHandler({
  isAuthorized: isInternalServiceRequest,
  cancelDraft: (draftId, hostedByDiscordId) =>
    cancelScouterGameDraft(requireScouterSupabase(), draftId, hostedByDiscordId),
});
