import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInternalServiceRequest } from "@/lib/admin-auth";
import { callOpenRouterVision } from "@/lib/openrouter-vision";
import {
  createScouterGameDraft,
  type CreateScouterDraftInput,
  type ScouterDraftResult,
} from "@/lib/scouter-drafts";
import {
  draftResponse,
  requireScouterSupabase,
  scouterDraftError,
} from "@/lib/scouter-draft-http";
import {
  downloadScouterImage,
  extractScouterGameFromStorage,
  type ScouterExtractedGame,
} from "@/lib/scouter-ocr";

const extractRequestSchema = z.object({
  scoreboard_image_path: z.string().trim().min(1).max(512),
  details_image_path: z.string().trim().min(1).max(512),
  game_ordinal: z.number().int().positive(),
  expected_smite_match_id: z.string().trim().min(1).max(128).optional(),
  hosted_by_discord_id: z.string().trim().min(1).max(128),
  season_id: z.string().trim().min(1).max(128),
  scouter_match_id: z.string().trim().min(1).max(128).optional(),
});

type ScouterExtractRequest = z.infer<typeof extractRequestSchema>;

interface ScouterExtractDependencies {
  isAuthorized: (request: NextRequest) => boolean;
  extractFromStorage: (input: ScouterExtractRequest) => Promise<ScouterExtractedGame>;
  createDraft: (input: CreateScouterDraftInput) => Promise<ScouterDraftResult>;
}

export function createScouterExtractHandler(dependencies: ScouterExtractDependencies) {
  return async function POST(request: NextRequest) {
    if (!dependencies.isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = extractRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
        { status: 400 },
      );
    }

    let extracted: ScouterExtractedGame;
    try {
      extracted = await dependencies.extractFromStorage(parsed.data);
    } catch (error) {
      if (error instanceof Error && "rawResponse" in error && typeof error.rawResponse === "string") {
        return NextResponse.json(
          { error: error.message, raw_response: error.rawResponse },
          { status: 422 },
        );
      }
      return scouterDraftError("extraction", error, {
        scoreboardImagePath: parsed.data.scoreboard_image_path,
        detailsImagePath: parsed.data.details_image_path,
      });
    }

    try {
      const result = await dependencies.createDraft({
        scoreboardImagePath: parsed.data.scoreboard_image_path,
        detailsImagePath: parsed.data.details_image_path,
        gameOrdinal: parsed.data.game_ordinal,
        hostedByDiscordId: parsed.data.hosted_by_discord_id,
        seasonId: parsed.data.season_id,
        scouterMatchId: parsed.data.scouter_match_id,
        extracted,
      });
      return NextResponse.json(draftResponse(result));
    } catch (error) {
      return scouterDraftError("create", error, {
        seasonId: parsed.data.season_id,
        gameOrdinal: parsed.data.game_ordinal,
      });
    }
  };
}

export const POST = createScouterExtractHandler({
  isAuthorized: isInternalServiceRequest,
  extractFromStorage: async (input) => {
    const supabase = requireScouterSupabase();
    return extractScouterGameFromStorage(
      {
        scoreboardImagePath: input.scoreboard_image_path,
        detailsImagePath: input.details_image_path,
        expectedSmiteMatchId: input.expected_smite_match_id,
      },
      {
        downloadImage: (path) => downloadScouterImage(supabase, path),
        callVision: (messages) => callOpenRouterVision(messages, {
          maxTokens: 8192,
          title: "SAL Scouter Extraction",
        }),
      },
    );
  },
  createDraft: (input) => createScouterGameDraft(requireScouterSupabase(), input),
});
