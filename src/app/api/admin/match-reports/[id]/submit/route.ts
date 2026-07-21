import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestSession } from "@/lib/admin-auth";
import { errorMessage, reportError } from "@/lib/error-monitor";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const playerStatSchema = z.object({
  playerIgn: z.string().min(1),
  playerId: z.string().optional(),
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

const submitSchema = z.object({
  games: z.array(gameSchema).min(1).max(5),
});

const resultSchema = z.object({
  code: z.enum(["applied", "already_processed"]),
  reportId: z.string().uuid(),
  matchId: z.string(),
  finalStatus: z.literal("done"),
  applied: z.boolean(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  totalGames: z.number().int().min(1).max(5),
  outboxIds: z.array(z.string()),
});

type ReviewedGames = z.infer<typeof submitSchema>["games"];
type RouteContext = { params: Promise<{ id: string }> };

interface MatchReportReviewDependencies {
  getSession: (request: NextRequest) => { discordId: string } | null;
  resolveMatchReport: (input: {
    reportId: string;
    actorDiscordId: string;
    games: ReviewedGames;
  }) => Promise<unknown>;
  revalidateLeagueData: () => void;
}

export function createMatchReportReviewHandler(dependencies: MatchReportReviewDependencies) {
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
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
        { status: 400 },
      );
    }

    try {
      const rawResult = await dependencies.resolveMatchReport({
        reportId: id,
        actorDiscordId: session.discordId,
        games: parsed.data.games,
      });
      const result = resultSchema.safeParse(rawResult);
      if (!result.success) {
        console.error("Match report review returned an invalid database response.", {
          reportId: id,
        });
        return NextResponse.json(
          { error: "Match report review returned an invalid database response." },
          { status: 502 },
        );
      }

      dependencies.revalidateLeagueData();
      return NextResponse.json({
        ok: true,
        homeScore: result.data.homeScore,
        awayScore: result.data.awayScore,
        totalGames: result.data.totalGames,
      });
    } catch (error) {
      const message = errorMessage(error, "Submit failed.");
      reportError("match-report submit failed", error, { reportId: id });
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
  if (code === "55000" || code === "23503" || code === "23505" || code === "23514") {
    return 409;
  }
  return 500;
}

async function resolveMatchReport(input: {
  reportId: string;
  actorDiscordId: string;
  games: ReviewedGames;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase.rpc("resolve_match_report_review", {
    p_match_report_id: input.reportId,
    p_actor_discord_id: input.actorDiscordId,
    p_games: input.games,
  });
  if (error) throw error;
  return data;
}

export const POST = createMatchReportReviewHandler({
  getSession: getAdminRequestSession,
  resolveMatchReport,
  revalidateLeagueData: () => revalidateTag("league-data", {}),
});
