import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest, getAdminRequestSession } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAdminLeagueData, LeagueDataUnavailableError } from "@/lib/league-data";
import type { MatchReportWithMatch } from "@/types/match-report";
import { fetchPublishedStatsByReport, mapMatchReportRow } from "@/lib/match-report-rows";

const createSchema = z.object({
  matchId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ reports: [] });

  const { data, error } = await supabase
    .from("match_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let leagueData;
  try {
    leagueData = await getAdminLeagueData();
  } catch (err) {
    if (err instanceof LeagueDataUnavailableError) {
      return NextResponse.json({ error: "League data is temporarily unavailable — please check back shortly." }, { status: 503 });
    }
    throw err;
  }
  const orgMap = new Map(leagueData.orgs.map((o) => [o.id, o]));
  const matchMap = new Map(leagueData.matches.map((m) => [m.id, m]));

  const statsByReport = await fetchPublishedStatsByReport(supabase, data ?? []);
  const reports: MatchReportWithMatch[] = (data ?? []).map((row) =>
    mapMatchReportRow(row, { orgMap, matchMap, statsByReport }),
  );

  return NextResponse.json({ reports });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const session = getAdminRequestSession(request);

  const body = await request.json().catch(() => null);
  const result = createSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message }, { status: 400 });

  const { matchId } = result.data;

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  // Check for existing report
  const { data: existing } = await supabase
    .from("match_reports")
    .select("id")
    .eq("match_id", matchId)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: (existing as { id: string }).id, existing: true });

  // Fetch the match to get season/division
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (matchErr || !matchRow) return NextResponse.json({ error: "Match not found." }, { status: 404 });

  const m = matchRow as { division_id: string; season_id: string };

  const { data: report, error } = await supabase
    .from("match_reports")
    .insert({
      match_id: matchId,
      season_id: m.season_id ?? "",
      division_id: m.division_id,
      status: "pending",
      submitted_by: session?.discordId ?? "admin",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: (report as { id: string }).id });
}
