import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestSession } from "@/lib/admin-auth";
import { errorMessage, reportError } from "@/lib/error-monitor";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Corrections to an already published match report.
 *
 * Approval (`/submit`) is deliberately terminal: a report already "done" comes
 * back already_processed with applied=false and nothing written, so a retried
 * approval can never overwrite a published result. Repairing one is therefore
 * its own explicit call, against its own RPC, carrying the revision the admin
 * loaded and a reason for the change.
 */

const playerStatSchema = z.object({
  playerIgn: z.string().min(1),
  playerId: z.string().min(1, "Every player must be linked before correcting."),
  orgId: z.string().optional(),
  side: z.enum(["home", "away"]),
  won: z.boolean(),
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  godPlayed: z.string().optional(),
  role: z.string().optional(),
  damageDealt: z.number().int().min(0).optional(),
  damageMitigated: z.number().int().min(0).optional(),
});

const gameSchema = z.object({
  gameNumber: z.number().int().min(1),
  winningSide: z.enum(["home", "away"]),
  players: z.array(playerStatSchema),
});

const correctSchema = z.object({
  games: z.array(gameSchema).min(1).max(5),
  expectedRevision: z.number().int().min(1),
  correctionKey: z.string().min(1).max(200),
  reason: z.string().trim().min(1, "A correction reason is required.").max(1000),
});

const resultSchema = z.object({
  code: z.enum(["applied", "already_corrected"]),
  reportId: z.string().uuid(),
  matchId: z.string(),
  finalStatus: z.literal("done"),
  applied: z.boolean(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  totalGames: z.number().int().min(1).max(5),
  revision: z.number().int().min(1),
});

type CorrectedGames = z.infer<typeof correctSchema>["games"];
type RouteContext = { params: Promise<{ id: string }> };

interface MatchReportCorrectionDependencies {
  getSession: (request: NextRequest) => { discordId: string } | null;
  correctMatchReport: (input: {
    reportId: string;
    actorDiscordId: string;
    expectedRevision: number;
    correctionKey: string;
    reason: string;
    games: CorrectedGames;
  }) => Promise<unknown>;
  revalidateLeagueData: () => void;
}

export function createMatchReportCorrectionHandler(
  dependencies: MatchReportCorrectionDependencies,
) {
  return async function POST(request: NextRequest, { params }: RouteContext) {
    const session = dependencies.getSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = correctSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
        { status: 400 },
      );
    }

    try {
      const rawResult = await dependencies.correctMatchReport({
        reportId: id,
        actorDiscordId: session.discordId,
        expectedRevision: parsed.data.expectedRevision,
        correctionKey: parsed.data.correctionKey,
        reason: parsed.data.reason,
        games: parsed.data.games,
      });
      const result = resultSchema.safeParse(rawResult);
      if (!result.success) {
        console.error("Match report correction returned an invalid database response.", {
          reportId: id,
        });
        return NextResponse.json(
          { error: "Match report correction returned an invalid database response." },
          { status: 502 },
        );
      }

      dependencies.revalidateLeagueData();
      return NextResponse.json({
        ok: true,
        // already_corrected means this exact correction key was already
        // recorded, so nothing was written a second time. Passing it through
        // keeps the client from reporting a fresh save that did not happen.
        applied: result.data.applied,
        code: result.data.code,
        homeScore: result.data.homeScore,
        awayScore: result.data.awayScore,
        totalGames: result.data.totalGames,
        revision: result.data.revision,
      });
    } catch (error) {
      const message = errorMessage(error, "Correction failed.");
      reportError("match-report correction failed", error, { reportId: id });
      return NextResponse.json({ error: message }, { status: databaseErrorStatus(error) });
    }
  };
}

function databaseErrorStatus(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  if (code === "P0002") return 404;
  if (code === "42501") return 403;
  if (code === "22023") return 400;
  // 55000 covers a superseded revision and a report that is not published;
  // 23505 covers a correction key reused for a different correction.
  if (code === "55000" || code === "23503" || code === "23505" || code === "23514") {
    return 409;
  }
  return 500;
}

async function correctMatchReport(input: {
  reportId: string;
  actorDiscordId: string;
  expectedRevision: number;
  correctionKey: string;
  reason: string;
  games: CorrectedGames;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase.rpc("correct_match_report_result", {
    p_match_report_id: input.reportId,
    p_actor_discord_id: input.actorDiscordId,
    p_expected_revision: input.expectedRevision,
    p_correction_key: input.correctionKey,
    p_reason: input.reason,
    p_games: input.games,
  });
  if (error) throw error;
  return data;
}

export const POST = createMatchReportCorrectionHandler({
  getSession: getAdminRequestSession,
  correctMatchReport,
  revalidateLeagueData: () => revalidateTag("league-data", {}),
});
