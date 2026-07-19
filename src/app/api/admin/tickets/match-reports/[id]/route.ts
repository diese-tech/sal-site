import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  buildMatchReportActionContext,
  parseMatchReportActionContext,
  type MatchReportActionContext,
} from "@/lib/admin-ticket-match-report";
import { getAdminLeagueData } from "@/lib/league-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

interface MatchReportActionContextDependencies {
  isAuthorized: (request: NextRequest) => boolean;
  loadContext: (id: string) => Promise<MatchReportActionContext | null>;
}

export function createMatchReportActionContextHandler(
  dependencies: MatchReportActionContextDependencies,
) {
  return async function GET(request: NextRequest, context: RouteContext) {
    if (!dependencies.isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id || id.length > 200) {
      return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
    }

    try {
      const actionContext = await dependencies.loadContext(id);
      if (!actionContext) {
        return NextResponse.json({ error: "Report not found." }, { status: 404 });
      }
      const safeContext = parseMatchReportActionContext(actionContext);
      if (!safeContext) {
        return NextResponse.json(
          { error: "Match report review details are temporarily unavailable." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { context: safeContext },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      console.error("Match-report ticket action context could not be loaded.", { reportId: id });
      return NextResponse.json(
        { error: "Match report review details are temporarily unavailable." },
        { status: 503 },
      );
    }
  };
}

async function loadMatchReportActionContext(id: string): Promise<MatchReportActionContext | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Database unavailable");

  const { data, error } = await supabase
    .from("match_reports")
    .select("id,match_id,season_id,status,screenshot_urls,extracted_data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const league = await getAdminLeagueData(data.season_id);
  return buildMatchReportActionContext(data, league);
}

export const GET = createMatchReportActionContextHandler({
  isAuthorized: isAdminRequest,
  loadContext: loadMatchReportActionContext,
});
