import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInternalServiceRequest } from "@/lib/admin-auth";
import {
  getScouterGameDraft,
  reviseScouterGameDraft,
  type ScouterDraftResult,
  type ScouterDraftSnapshot,
} from "@/lib/scouter-drafts";
import {
  draftResponse,
  requireScouterSupabase,
  scouterDraftError,
} from "@/lib/scouter-draft-http";
import { scouterExtractedGameSchema } from "@/lib/scouter-ocr";

type RouteContext = { params: Promise<{ draftId: string }> };

const reviseRequestSchema = z.object({
  hosted_by_discord_id: z.string().trim().min(1).max(128),
  expected_revision: z.number().int().positive(),
  game: scouterExtractedGameSchema,
});

interface DraftRouteDependencies {
  isAuthorized: (request: NextRequest) => boolean;
  getDraft: (draftId: string, hostedByDiscordId: string) => Promise<ScouterDraftSnapshot>;
  reviseDraft: (input: {
    draftId: string;
    hostedByDiscordId: string;
    expectedRevision: number;
    game: z.infer<typeof scouterExtractedGameSchema>;
  }) => Promise<ScouterDraftResult>;
}

export function createScouterDraftRoute(dependencies: DraftRouteDependencies) {
  return {
    GET: async (request: NextRequest, context: RouteContext) => {
      if (!dependencies.isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const hostedByDiscordId = request.nextUrl.searchParams.get("hosted_by_discord_id")?.trim();
      if (!hostedByDiscordId) {
        return NextResponse.json({ error: "hosted_by_discord_id is required." }, { status: 400 });
      }
      const { draftId } = await context.params;
      try {
        return NextResponse.json(draftResponse(await dependencies.getDraft(draftId, hostedByDiscordId)));
      } catch (error) {
        return scouterDraftError("read", error, { draftId });
      }
    },
    PATCH: async (request: NextRequest, context: RouteContext) => {
      if (!dependencies.isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const body = await request.json().catch(() => null);
      const parsed = reviseRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
          { status: 400 },
        );
      }
      const { draftId } = await context.params;
      try {
        const result = await dependencies.reviseDraft({
          draftId,
          hostedByDiscordId: parsed.data.hosted_by_discord_id,
          expectedRevision: parsed.data.expected_revision,
          game: parsed.data.game,
        });
        return NextResponse.json(draftResponse(result));
      } catch (error) {
        return scouterDraftError("revise", error, { draftId });
      }
    },
  };
}

const handlers = createScouterDraftRoute({
  isAuthorized: isInternalServiceRequest,
  getDraft: (draftId, hostedByDiscordId) =>
    getScouterGameDraft(requireScouterSupabase(), draftId, hostedByDiscordId),
  reviseDraft: (input) => reviseScouterGameDraft(requireScouterSupabase(), input),
});

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
