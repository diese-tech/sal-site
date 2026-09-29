import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { DivisionId, Match, Org } from "@/types/league";
import type { ExtractedGame, MatchReportWithMatch } from "@/types/match-report";
import { groupPublishedStats, groupRowsByReport, type PublishedStatRow } from "@/lib/match-report-published";

/**
 * A `match_reports` row as selected with `*`. Kept loose on purpose: both
 * callers hand us rows straight from PostgREST.
 */
export type MatchReportRow = Record<string, unknown>;

const PUBLISHED_STAT_COLUMNS =
  "match_report_id, game_number, player_ign, player_id, org_id, won, kills, deaths, assists, god_played, role, damage_dealt, damage_mitigated";

// Reports fetched per query. A report holds at most a few dozen stat rows, so a
// chunk sits far below PostgREST's `max_rows` cap (1000); the truncation check
// below is what actually guarantees completeness rather than this arithmetic.
const REPORTS_PER_QUERY = 10;

/**
 * One atomic read of the published stat rows for `reportIds`, or `null` when the
 * server truncated it. PostgREST cuts a response at `max_rows` without an error,
 * but `count: "exact"` reports the true total, so a shortfall is detectable.
 */
async function readStatsChunk(
  supabase: SupabaseClient<Database>,
  reportIds: string[],
): Promise<PublishedStatRow[] | null> {
  const { data, count, error } = await supabase
    .from("player_match_stats")
    .select(PUBLISHED_STAT_COLUMNS, { count: "exact" })
    .in("match_report_id", reportIds)
    .order("game_number", { ascending: true });

  if (error) throw new Error(`Unable to load published match stats: ${error.message}`);
  const rows = (data ?? []) as PublishedStatRow[];
  return count === null || rows.length >= count ? rows : null;
}

/**
 * Completed reports are displayed from their published stat rows, so the admin
 * sees what is actually on record rather than the original AI extraction.
 * `extracted_data` never receives corrections, so it must not be the source.
 *
 * The rows must be complete: a correction submits exactly what the editor holds
 * as the full result, so a missing row would make it delete that official stat.
 * Each read is a single query over a small set of reports, so it is one
 * consistent snapshot. Offset paging over every report is deliberately avoided:
 * a concurrent correction elsewhere shifts the offsets and silently skips or
 * duplicates rows. A truncated read is retried per report, and a report whose own
 * rows cannot be read completely fails loudly instead of yielding a partial set.
 */
export async function fetchPublishedStatsByReport(
  supabase: SupabaseClient<Database>,
  rows: MatchReportRow[],
): Promise<Map<string, PublishedStatRow[]>> {
  const doneIds = rows.filter((r) => r.status === "done").map((r) => r.id as string);
  if (doneIds.length === 0) return new Map();

  const chunks: string[][] = [];
  for (let i = 0; i < doneIds.length; i += REPORTS_PER_QUERY) {
    chunks.push(doneIds.slice(i, i + REPORTS_PER_QUERY));
  }

  const readComplete = async (ids: string[]): Promise<PublishedStatRow[]> => {
    const chunk = await readStatsChunk(supabase, ids);
    if (chunk) return chunk;
    if (ids.length === 1) {
      throw new Error(`Published stats for report ${ids[0]} exceed the API row limit and cannot be loaded completely`);
    }
    return (await Promise.all(ids.map((id) => readComplete([id])))).flat();
  };

  const collected = (await Promise.all(chunks.map(readComplete))).flat();
  return groupRowsByReport(collected);
}

export interface MatchReportRowContext {
  orgMap: Map<string, Org>;
  matchMap: Map<string, Match>;
  statsByReport: Map<string, PublishedStatRow[]>;
}

/**
 * The single mapping from a `match_reports` row to the shape the admin client
 * consumes. Both the server page loader and `GET /api/admin/match-reports` go
 * through here: when they each kept their own copy they drifted, and a report
 * refreshed through one path lost fields the other supplied.
 */
export function mapMatchReportRow(
  row: MatchReportRow,
  { orgMap, matchMap, statsByReport }: MatchReportRowContext,
): MatchReportWithMatch {
  const match = matchMap.get(row.match_id as string);
  const homeOrg = orgMap.get(match?.homeOrgId ?? "");
  const awayOrg = orgMap.get(match?.awayOrgId ?? "");
  const published = statsByReport.get(row.id as string);

  return {
    id: row.id as string,
    matchId: row.match_id as string,
    seasonId: row.season_id as string,
    divisionId: row.division_id as DivisionId,
    status: row.status as MatchReportWithMatch["status"],
    submittedBy: row.submitted_by as string,
    homeScore: row.home_score as number | undefined,
    awayScore: row.away_score as number | undefined,
    totalGames: row.total_games as number | undefined,
    screenshotUrls: (row.screenshot_urls as string[]) ?? [],
    extractedData: (row.extracted_data as ExtractedGame[] | null) ?? undefined,
    publishedGames: published
      ? groupPublishedStats(published, match?.homeOrgId ?? "")
      : undefined,
    createdAt: row.created_at as string,
    reviewedAt: (row.reviewed_at as string | null) ?? undefined,
    reviewedBy: (row.reviewed_by as string | null) ?? undefined,
    // Carries the row's real revision so a correction can prove which version
    // the admin loaded. Substituting a default here would make every report
    // past its first revision fail the RPC's stale-revision check.
    revision: row.revision as number,
    hostSubmittedAt: (row.host_submitted_at as string | null) ?? undefined,
    homeOrgId: match?.homeOrgId ?? "",
    homeOrgName: homeOrg?.name ?? match?.homeOrgId ?? "",
    homeOrgTag: homeOrg?.tag ?? "",
    awayOrgId: match?.awayOrgId ?? "",
    awayOrgName: awayOrg?.name ?? match?.awayOrgId ?? "",
    awayOrgTag: awayOrg?.tag ?? "",
    matchDate: match?.scheduledDate ?? "",
    week: match?.week ?? 0,
  };
}
