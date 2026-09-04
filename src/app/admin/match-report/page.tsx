import { requireAdmin } from "@/lib/admin-auth";
import { getAdminLeagueData } from "@/lib/league-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { MatchReportClient } from "@/components/admin/MatchReportClient";
import type { MatchReportWithMatch } from "@/types/match-report";
import { fetchPublishedStatsByReport, mapMatchReportRow } from "@/lib/match-report-rows";

export const metadata = { title: "Match Report - SAL Admin" };

async function getReports(): Promise<MatchReportWithMatch[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const [{ data: rows }, leagueData] = await Promise.all([
    supabase.from("match_reports").select("*").order("created_at", { ascending: false }),
    getAdminLeagueData(),
  ]);

  const orgMap = new Map(leagueData.orgs.map((o) => [o.id, o]));
  const matchMap = new Map(leagueData.matches.map((m) => [m.id, m]));
  const statsByReport = await fetchPublishedStatsByReport(supabase, rows ?? []);

  return (rows ?? []).map((row) => mapMatchReportRow(row, { orgMap, matchMap, statsByReport }));
}

export default async function MatchReportPage() {
  await requireAdmin();
  const [data, reports] = await Promise.all([getAdminLeagueData(), getReports()]);

  return (
    <main className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-white">Match Report</h1>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">
          Upload SMITE DETAILS screenshots → AI extracts stats → review → submit result
        </p>
      </div>
      <MatchReportClient data={data} initialReports={reports} />
    </main>
  );
}
