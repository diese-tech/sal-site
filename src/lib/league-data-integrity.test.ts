import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: { message: string } | null };

const testState = vi.hoisted(() => ({
  results: new Map<string, QueryResult>(),
  reportError: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/error-monitor", () => ({
  reportError: testState.reportError,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => makeQuery(table),
  }),
}));

function makeQuery(table: string) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    is: () => query,
    order: () => query,
    maybeSingle: () => Promise.resolve(testState.results.get(table)),
    then: <TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(testState.results.get(table) as QueryResult).then(onfulfilled, onrejected),
  };
  return query;
}

import { fetchLeagueData, LeagueDataUnavailableError } from "./league-data";

describe("fetchLeagueData integrity diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    testState.results.clear();
    testState.results.set("seasons", {
      data: {
        id: "preseason-s2",
        name: "Preseason S2",
        status: "pre-season",
        is_current: true,
        start_date: "2026-07-18",
        end_date: "2026-08-24",
        current_week: 1,
      },
      error: null,
    });
    testState.results.set("divisions", {
      data: [{ id: "terra", name: "Terra", description: "", tier: 1, accent_color: "emerald" }],
      error: null,
    });
    testState.results.set("season_orgs", {
      data: [
        { org_id: "org-missing", division_id: "terra" },
        { org_id: "org-second", division_id: "terra" },
      ],
      error: null,
    });
    testState.results.set("season_rosters", {
      data: [
        { player_id: "player-missing", org_id: null, division_id: "terra", is_captain: false },
        { player_id: "player-second", org_id: null, division_id: "terra", is_captain: false },
      ],
      error: null,
    });
    testState.results.set("announcements", { data: [], error: null });
    testState.results.set("matches", { data: [], error: null });
    testState.results.set("orgs", { data: [], error: null });
    testState.results.set("players", { data: [], error: null });
  });

  it("reports the exact missing identity ids while keeping the thrown error generic", async () => {
    await expect(fetchLeagueData()).rejects.toEqual(
      expect.objectContaining<Partial<LeagueDataUnavailableError>>({
        name: "LeagueDataUnavailableError",
        message: "Season assignments reference unavailable identities.",
      }),
    );

    expect(testState.reportError).toHaveBeenCalledWith(
      "getLeagueData",
      expect.objectContaining({ message: "Season assignments reference unavailable identities." }),
      {
        seasonId: "preseason-s2",
        missingOrgIds: ["org-missing", "org-second"],
        missingPlayerIds: ["player-missing", "player-second"],
      },
    );
  });
});
