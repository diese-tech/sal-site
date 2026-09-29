import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  fetchPublishedStatsByReport,
  mapMatchReportRow,
  type MatchReportRow,
  type MatchReportRowContext,
} from "@/lib/match-report-rows";
import type { PublishedStatRow } from "@/lib/match-report-published";
import type { DivisionId, Match, Org } from "@/types/league";

const HOME_ORG = "org-home";
const AWAY_ORG = "org-away";
const REPORT_ID = "report-1";

function org(id: string, name: string, tag: string): Org {
  return {
    id,
    name,
    tag,
    divisionId: "d1" as DivisionId,
    logoInitials: tag,
    logoGradient: "",
    primaryColor: "",
    accentGradient: "",
  };
}

function statRow(overrides: Partial<PublishedStatRow> = {}): PublishedStatRow {
  return {
    match_report_id: REPORT_ID,
    game_number: 1,
    player_ign: "Astra",
    player_id: "player-1",
    org_id: HOME_ORG,
    won: true,
    kills: 7,
    deaths: 2,
    assists: 5,
    god_played: "Anubis",
    role: "Mid",
    damage_dealt: 21000,
    damage_mitigated: 3400,
    ...overrides,
  };
}

function context(statsByReport = new Map<string, PublishedStatRow[]>()): MatchReportRowContext {
  const match: Match = {
    id: "match-1",
    divisionId: "d1" as DivisionId,
    homeOrgId: HOME_ORG,
    awayOrgId: AWAY_ORG,
    scheduledDate: "2026-08-01",
    scheduledTime: "19:00",
    status: "completed",
    week: 3,
    seasonId: "season-1",
  };
  return {
    orgMap: new Map([
      [HOME_ORG, org(HOME_ORG, "Home Org", "HOM")],
      [AWAY_ORG, org(AWAY_ORG, "Away Org", "AWY")],
    ]),
    matchMap: new Map([[match.id, match]]),
    statsByReport,
  };
}

function row(overrides: MatchReportRow = {}): MatchReportRow {
  return {
    id: REPORT_ID,
    match_id: "match-1",
    season_id: "season-1",
    division_id: "d1",
    status: "done",
    submitted_by: "123",
    home_score: 2,
    away_score: 1,
    total_games: 3,
    screenshot_urls: ["https://example.test/a.png"],
    extracted_data: null,
    created_at: "2026-08-01T00:00:00Z",
    reviewed_at: null,
    reviewed_by: null,
    revision: 1,
    host_submitted_at: null,
    ...overrides,
  };
}

describe("mapMatchReportRow", () => {
  it("carries the row's real revision rather than defaulting it", () => {
    const mapped = mapMatchReportRow(row({ revision: 4 }), context());
    expect(mapped.revision).toBe(4);
  });

  it("keeps a first-revision report at 1", () => {
    expect(mapMatchReportRow(row({ revision: 1 }), context()).revision).toBe(1);
  });

  it("rebuilds published games for a completed report", () => {
    const stats = new Map([[REPORT_ID, [statRow(), statRow({ player_ign: "Bolt", org_id: AWAY_ORG, won: false })]]]);
    const mapped = mapMatchReportRow(row(), context(stats));

    expect(mapped.publishedGames).toHaveLength(1);
    expect(mapped.publishedGames?.[0].players.map((p) => p.ign)).toEqual(["Astra", "Bolt"]);
    expect(mapped.publishedGames?.[0].players.map((p) => p.side)).toEqual(["home", "away"]);
  });

  it("leaves publishedGames undefined when the report has no published rows", () => {
    expect(mapMatchReportRow(row({ status: "review" }), context()).publishedGames).toBeUndefined();
  });

  it("normalises nullable timestamps to undefined", () => {
    const mapped = mapMatchReportRow(row(), context());
    expect(mapped.reviewedAt).toBeUndefined();
    expect(mapped.reviewedBy).toBeUndefined();
    expect(mapped.hostSubmittedAt).toBeUndefined();
  });

  it("resolves both org identities from the match", () => {
    const mapped = mapMatchReportRow(row(), context());
    expect(mapped.homeOrgName).toBe("Home Org");
    expect(mapped.awayOrgTag).toBe("AWY");
    expect(mapped.week).toBe(3);
  });
});

/**
 * Stands in for PostgREST: filters by `.in()` and, like the real server, silently
 * truncates every response at `maxRows` while still reporting the true total in
 * `count`. Records the report ids each query asked for.
 */
function fakeStatsClient(dataset: PublishedStatRow[], maxRows: number, error?: { message: string }) {
  const queries: string[][] = [];
  const client = {
    from: () => {
      let ids: string[] = [];
      const builder = {
        select: () => builder,
        order: () => builder,
        in: (_column: string, values: string[]) => {
          ids = values;
          queries.push(values);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const matching = dataset.filter((r) => ids.includes(r.match_report_id));
          return Promise.resolve(
            error
              ? { data: null, count: null, error }
              : { data: matching.slice(0, maxRows), count: matching.length, error: null },
          ).then(resolve);
        },
      };
      return builder;
    },
  };
  return { supabase: client as unknown as SupabaseClient<Database>, queries };
}

describe("fetchPublishedStatsByReport", () => {
  const reportRows = (n: number) => Array.from({ length: n }, (_, i) => row({ id: `report-${i}`, status: "done" }));
  const statsFor = (reportId: string, count: number) =>
    Array.from({ length: count }, (_, i) =>
      statRow({ match_report_id: reportId, game_number: 1 + Math.floor(i / 10), player_ign: `${reportId}-P${i}` }),
    );

  it("returns every report's rows across several chunked queries", async () => {
    const reports = reportRows(25);
    const dataset = reports.flatMap((r) => statsFor(r.id as string, 20));
    const { supabase, queries } = fakeStatsClient(dataset, 1000);
    const stats = await fetchPublishedStatsByReport(supabase, reports);

    expect(stats.size).toBe(25);
    expect([...stats.values()].every((rowsForReport) => rowsForReport.length === 20)).toBe(true);
    expect(queries.length).toBe(3);
  });

  it("re-reads a truncated chunk report by report rather than accepting a partial set", async () => {
    const reports = reportRows(3);
    const dataset = reports.flatMap((r) => statsFor(r.id as string, 20));
    // The cap (25) cuts any multi-report chunk short but fits a single report.
    const { supabase, queries } = fakeStatsClient(dataset, 25);
    const stats = await fetchPublishedStatsByReport(supabase, reports);

    expect([...stats.values()].map((v) => v.length)).toEqual([20, 20, 20]);
    expect(queries.some((ids) => ids.length === 1)).toBe(true);
  });

  it("throws when a single report cannot be read completely", async () => {
    const reports = reportRows(1);
    const { supabase } = fakeStatsClient(statsFor("report-0", 30), 10);
    await expect(fetchPublishedStatsByReport(supabase, reports)).rejects.toThrow(/cannot be loaded completely/);
  });

  it("skips the query entirely when nothing is completed", async () => {
    const { supabase, queries } = fakeStatsClient(statsFor("report-0", 5), 1000);
    const stats = await fetchPublishedStatsByReport(supabase, [row({ status: "review" })]);

    expect(stats.size).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it("throws instead of returning a partial set when a query fails", async () => {
    const { supabase } = fakeStatsClient(statsFor("report-0", 5), 1000, { message: "boom" });
    await expect(fetchPublishedStatsByReport(supabase, reportRows(1))).rejects.toThrow(/boom/);
  });
});
