import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInternalServiceRequest } from "@/lib/admin-auth";
import { errorMessage, reportError } from "@/lib/error-monitor";
import { callOpenRouterVision } from "@/lib/openrouter-vision";
import {
  downloadScouterImage,
  extractScouterGameFromStorage,
  type ScouterExtractedGame,
} from "@/lib/scouter-ocr";
import {
  writeScouterGame,
  type ScouterWriteInput,
  type ScouterWriteResult,
} from "@/lib/scouter-writes";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const ingestRequestSchema = z.object({
  scoreboard_image_path: z.string().trim().min(1).max(512),
  details_image_path: z.string().trim().min(1).max(512),
  game_ordinal: z.number().int().positive(),
  expected_smite_match_id: z.string().trim().min(1).max(128).optional(),
  hosted_by_discord_id: z.string().trim().min(1).max(128),
  season_id: z.string().trim().min(1).max(128),
  scouter_match_id: z.string().trim().min(1).max(128).optional(),
});

type ScouterIngestRequest = z.infer<typeof ingestRequestSchema>;

interface ScouterIngestDependencies {
  isAuthorized: (request: NextRequest) => boolean;
  extractFromStorage: (input: ScouterIngestRequest) => Promise<ScouterExtractedGame>;
  writeGame: (input: ScouterWriteInput) => Promise<ScouterWriteResult>;
  receiptUrl: (scouterMatchId: string, scouterGameId: string) => string;
}

export function createScouterIngestHandler(dependencies: ScouterIngestDependencies) {
  return async function POST(request: NextRequest) {
    if (!dependencies.isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = ingestRequestSchema.safeParse(body);
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
      if (
        error instanceof Error
        && "rawResponse" in error
        && typeof error.rawResponse === "string"
      ) {
        return NextResponse.json(
          { error: error.message, raw_response: error.rawResponse },
          { status: 422 },
        );
      }
      const message = errorMessage(error, "Scouter extraction failed.");
      reportError("scouter extraction failed", error, {
        scoreboardImagePath: parsed.data.scoreboard_image_path,
        detailsImagePath: parsed.data.details_image_path,
      });
      return NextResponse.json({ error: message }, { status: errorStatus(error) });
    }

    let result: ScouterWriteResult;
    try {
      result = await dependencies.writeGame({
        scoreboardImagePath: parsed.data.scoreboard_image_path,
        detailsImagePath: parsed.data.details_image_path,
        gameOrdinal: parsed.data.game_ordinal,
        hostedByDiscordId: parsed.data.hosted_by_discord_id,
        seasonId: parsed.data.season_id,
        scouterMatchId: parsed.data.scouter_match_id,
        extracted,
      });
    } catch (error) {
      const message = errorMessage(error, "Scouter write failed.");
      reportError("scouter write failed", error, {
        seasonId: parsed.data.season_id,
        gameOrdinal: parsed.data.game_ordinal,
      });
      return NextResponse.json({ error: message }, { status: errorStatus(error) });
    }
    const receiptUrl = dependencies.receiptUrl(result.scouterMatchId, result.scouterGameId);

    if (result.code === "existing") {
      return NextResponse.json({
        existing_scouter_game_id: result.scouterGameId,
        receipt_url: receiptUrl,
      });
    }

    return NextResponse.json({
      scouter_match_id: result.scouterMatchId,
      scouter_game_id: result.scouterGameId,
      receipt_url: receiptUrl,
      participants_summary: result.participantsSummary,
    });
  };
}

function errorStatus(error: unknown) {
  if (
    error instanceof Error
    && error.message === "Supabase not configured."
  ) return 503;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
  if (code === "P0002") return 404;
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  if (code === "23503" || code === "23505" || code === "23514") return 409;
  return 500;
}

function requireSupabase() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured.");
  return supabase;
}

function receiptUrl(scouterMatchId: string, scouterGameId: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sal.gg";
  const url = new URL(`/scouters/${encodeURIComponent(scouterMatchId)}`, siteUrl);
  url.searchParams.set("game", scouterGameId);
  return url.toString();
}

export const POST = createScouterIngestHandler({
  isAuthorized: isInternalServiceRequest,
  extractFromStorage: async (input) => {
    const supabase = requireSupabase();
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
  writeGame: async (input) => {
    const supabase = requireSupabase();
    return writeScouterGame(input, {
      rpc: (_name, args) => supabase.rpc("ingest_scouter_game", args),
    });
  },
  receiptUrl,
});
