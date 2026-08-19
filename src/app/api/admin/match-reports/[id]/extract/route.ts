import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { toDatabaseJson } from "@/lib/database-json";
import { getAdminLeagueData, LeagueDataUnavailableError } from "@/lib/league-data";
import { errorMessage } from "@/lib/error-monitor";
import { extractMatchReportGames } from "@/lib/match-report-extraction";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "AI extraction not configured (OPENROUTER_API_KEY missing).", aiUnavailable: true },
      { status: 503 },
    );
  }

  // Load report + match context
  const { data: report, error: reportErr } = await supabase
    .from("match_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (reportErr || !report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const r = report as { screenshot_urls: string[]; match_id: string };
  if (!r.screenshot_urls?.length) return NextResponse.json({ error: "No screenshots uploaded yet." }, { status: 400 });

  // Mark as extracting
  await supabase.from("match_reports").update({ status: "extracting" }).eq("id", id);

  try {
    const leagueData = await getAdminLeagueData();
    const match = leagueData.matches.find((m) => m.id === r.match_id);
    const homeOrg = leagueData.orgs.find((o) => o.id === match?.homeOrgId);
    const awayOrg = leagueData.orgs.find((o) => o.id === match?.awayOrgId);
    const homePlayers = leagueData.players.filter((p) => p.orgId === match?.homeOrgId).map((p) => p.ign);
    const awayPlayers = leagueData.players.filter((p) => p.orgId === match?.awayOrgId).map((p) => p.ign);

    const games = await extractMatchReportGames({
      screenshotUrls: r.screenshot_urls,
      homeOrgName: homeOrg?.name ?? "Home Team",
      homeIgns: homePlayers,
      awayOrgName: awayOrg?.name ?? "Away Team",
      awayIgns: awayPlayers,
    });

    // Store extracted data and mark as review
    await supabase
      .from("match_reports")
      .update({ status: "review", extracted_data: toDatabaseJson(games) })
      .eq("id", id);

    return NextResponse.json({ games });
  } catch (err) {
    // Reset to pending on failure so admin can retry
    await supabase.from("match_reports").update({ status: "pending" }).eq("id", id);
    if (err instanceof LeagueDataUnavailableError) {
      return NextResponse.json({ error: "League data is temporarily unavailable — please check back shortly." }, { status: 503 });
    }
    const message = errorMessage(err, "Extraction failed.");
    console.error("extract route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
