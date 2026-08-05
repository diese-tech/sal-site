import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInternalServiceRequest } from "@/lib/admin-auth";
import {
  confirmScouterGameDraft,
  type ScouterDraftConfirmResult,
} from "@/lib/scouter-drafts";
import {
  confirmResponse,
  requireScouterSupabase,
  scouterDraftError,
} from "@/lib/scouter-draft-http";

type RouteContext = { params: Promise<{ draftId: string }> };
const requestSchema = z.object({
  hosted_by_discord_id: z.string().trim().min(1).max(128),
  expected_revision: z.number().int().positive(),
  identity_override_reason: z.string().trim().min(1).max(500).optional(),
});

interface ConfirmDependencies {
  isAuthorized: (request: NextRequest) => boolean;
  confirmDraft: (input: {
    draftId: string;
    hostedByDiscordId: string;
    expectedRevision: number;
    identityOverrideReason?: string;
  }) => Promise<ScouterDraftConfirmResult>;
}

export function createScouterDraftConfirmHandler(dependencies: ConfirmDependencies) {
  return async function POST(request: NextRequest, context: RouteContext) {
    if (!dependencies.isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
        { status: 400 },
      );
    }
    const { draftId } = await context.params;
    try {
      const result = await dependencies.confirmDraft({
        draftId,
        hostedByDiscordId: parsed.data.hosted_by_discord_id,
        expectedRevision: parsed.data.expected_revision,
        identityOverrideReason: parsed.data.identity_override_reason,
      });
      return NextResponse.json(confirmResponse(result));
    } catch (error) {
      return scouterDraftError("confirm", error, { draftId });
    }
  };
}

export const POST = createScouterDraftConfirmHandler({
  isAuthorized: isInternalServiceRequest,
  confirmDraft: (input) => confirmScouterGameDraft(requireScouterSupabase(), input),
});
