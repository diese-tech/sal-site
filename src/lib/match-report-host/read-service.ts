import type { SupabaseClient } from "@supabase/supabase-js";
import { diagnosticsSchema, extractedGamesSchema } from "./contracts";
import type { Database } from "@/types/database.types";
import type { HostMatchReportReview, HostReviewTeam } from "@/types/match-report-host";
import type { ExtractedGame } from "@/types/match-report";

type ErrorShape = { message: string; code?: string } | null;
type UntypedResult = PromiseLike<{ data: unknown; error: ErrorShape }>;
interface UntypedQuery extends UntypedResult {
  select(columns: string): UntypedQuery;
  eq(column: string, value: unknown): UntypedQuery;
  in(column: string, values: unknown[]): UntypedQuery;
  is(column: string, value: unknown): UntypedQuery;
  single(): UntypedResult;
}
type UntypedClient = {
  from(table: string): UntypedQuery;
  rpc(name: string, args: Record<string, unknown>): UntypedResult;
};

export async function loadActiveRosterPlayers(client: unknown, playerIds: string[]) {
  if (playerIds.length === 0) return [];
  const untyped = client as UntypedClient;
  const { data, error } = await untyped
    .from("players")
    .select("id,ign")
    .in("id", playerIds)
    .is("archived_at", null)
    .is("deletion_scheduled_at", null);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Roster identities have an invalid shape.");
  return data as Array<{ id: string; ign: string }>;
}

export async function readExtractionDiagnostics(
  rpc: UntypedClient["rpc"],
  reportId: string,
  games: ExtractedGame[],
) {
  const structurallyReady = games.length > 0 && games.every((game) =>
    game.winningSide !== "unknown" &&
    game.players.length === 10 &&
    game.players.filter((player) => player.side === "home").length === 5 &&
    game.players.filter((player) => player.side === "away").length === 5
  );
  if (!structurallyReady) {
    return {
      gameCount: games.length,
      duplicateIgns: [],
      unlinkedIgns: [],
      ambiguousIgns: [],
      games: [],
    };
  }
  const { data, error } = await rpc("match_report_extraction_diagnostics", {
    p_match_report_id: reportId,
    p_games: games,
  });
  if (error) throw error;
  return diagnosticsSchema.parse(data);
}

type ReportRow = {
  id: string;
  match_id: string;
  revision: number;
  status: HostMatchReportReview["report"]["status"];
  screenshot_urls: string[] | null;
  extracted_data: unknown;
};

export async function readHostMatchReportReview(
  client: SupabaseClient<Database>,
  input: { matchReportId: string; hostDiscordId: string },
): Promise<HostMatchReportReview | null> {
  const untyped = client as unknown as UntypedClient;
  const { data: rawReport, error: reportError } = await untyped
    .from("match_reports")
    .select("id,match_id,revision,status,screenshot_urls,extracted_data")
    .eq("id", input.matchReportId)
    .eq("host_discord_id", input.hostDiscordId)
    .single();
  if (reportError) {
    if (reportError.code === "PGRST116") return null;
    throw reportError;
  }
  if (!rawReport || typeof rawReport !== "object") return null;
  const report = rawReport as ReportRow;
  if (report.status === "cancelled") return null;
  const gamesResult = extractedGamesSchema.safeParse(report.extracted_data ?? []);
  if (!gamesResult.success) throw new Error("Match report extraction has an invalid shape.");

  const { data: match, error: matchError } = await client
    .from("matches")
    .select("id,season_id,division_id,scheduled_date,week,home_org_id,away_org_id")
    .eq("id", report.match_id)
    .single();
  if (matchError || !match) throw matchError ?? new Error("Match not found.");

  const { data: orgRows, error: orgError } = await client
    .from("orgs")
    .select("id,name,tag")
    .in("id", [match.home_org_id, match.away_org_id]);
  if (orgError) throw orgError;

  const { data: rosterRows, error: rosterError } = await client
    .from("season_rosters")
    .select("player_id,org_id")
    .eq("season_id", match.season_id ?? "")
    .eq("division_id", match.division_id)
    .in("org_id", [match.home_org_id, match.away_org_id])
    .eq("roster_status", "active");
  if (rosterError) throw rosterError;
  const playerIds = [...new Set((rosterRows ?? []).map((row) => row.player_id))];
  const playerRows = await loadActiveRosterPlayers(client, playerIds);
  const playerMap = new Map(playerRows.map((row) => [row.id, row.ign]));
  const orgMap = new Map((orgRows ?? []).map((row) => [row.id, row]));

  const team = (orgId: string): HostReviewTeam => {
    const org = orgMap.get(orgId);
    if (!org) throw new Error("Match organization not found.");
    return {
      id: org.id,
      name: org.name,
      tag: org.tag,
      roster: (rosterRows ?? [])
        .filter((row) => row.org_id === orgId)
        .flatMap((row) => {
          const ign = playerMap.get(row.player_id);
          return ign ? [{ id: row.player_id, ign }] : [];
        })
        .sort((a, b) => a.ign.localeCompare(b.ign)),
    };
  };

  const diagnostics = await readExtractionDiagnostics(
    untyped.rpc.bind(untyped),
    report.id,
    gamesResult.data,
  );

  return {
    report: {
      id: report.id,
      revision: report.revision,
      status: report.status,
      screenshotUrls: report.screenshot_urls ?? [],
      games: gamesResult.data,
      diagnostics,
    },
    match: {
      id: match.id,
      seasonId: match.season_id ?? "",
      divisionId: match.division_id,
      scheduledDate: match.scheduled_date,
      week: match.week,
      home: team(match.home_org_id),
      away: team(match.away_org_id),
    },
  };
}
