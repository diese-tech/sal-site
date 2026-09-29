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

// Requested page size. PostgREST silently truncates any response at its
// `max_rows` cap (1000 by default) without an error, so a single query cannot be
// trusted to return every row. We never assume a page is the last one because it
// was short: the cap may be lower than this, so paging stops only on an empty page.
const STATS_PAGE_SIZE = 1000;

/**
 * Completed reports are displayed from their published stat rows, so the admin
 * sees what is actually on record rather than the original AI extraction.
 * `extracted_data` never receives corrections, so it must not be the source.
 *
 * The rows must be complete: a correction submits exactly what the editor holds
 * as the full result, so a silently truncated set would make a correction delete
 * the omitted official stats. Rows are therefore paged in a total order until
 * exhausted, and any query error throws rather than yielding a partial set.
 */
export async function fetchPublishedStatsByReport(
  supabase: SupabaseClient<Database>,
  rows: MatchReportRow[],
): Promise<Map<string, PublishedStatRow[]>> {
  const doneIds = rows.filter((r) => r.status === "done").map((r) => r.id as string);
  if (doneIds.length === 0) return new Map();

  const collected: PublishedStatRow[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .from("player_match_stats")
      .select(PUBLISHED_STAT_COLUMNS)
      .in("match_report_id", doneIds)
      .order("match_report_id", { ascending: true })
      .order("game_number", { ascending: true })
      .order("player_id", { ascending: true })
      .order("player_ign", { ascending: true })
      .range(from, from + STATS_PAGE_SIZE - 1);

    if (error) throw new Error(`Unable to load published match stats: ${error.message}`);
    if (!data || data.length === 0) break;

    collected.push(...(data as PublishedStatRow[]));
    from += data.length;
  }

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
