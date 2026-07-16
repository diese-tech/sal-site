import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ensure Supabase is "unconfigured" for every test in this file so
// getSupabaseServerClient() returns null and the mock-data gate is
// exercised the same way a misconfigured/outage deploy would hit it (#153).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", ""); // test-only env stub, not a real key
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("toDbMatch winner derivation (schema parity M1)", () => {
  const base = {
    id: "m1",
    divisionId: "solar" as const,
    homeOrgId: "org-home",
    awayOrgId: "org-away",
    scheduledDate: "2026-07-16",
    scheduledTime: "19:00",
    week: 1,
    seasonId: "s1",
  };

  it("writes winner_org_id and score for decided matches, re-derives on correction", async () => {
    const { toDbMatch } = await import("./league-data");
    const won = toDbMatch({ ...base, status: "completed", homeScore: 1, awayScore: 2 });
    expect(won.winner_org_id).toBe("org-away");
    expect(won.score).toBe("2-1");
    const forfeit = toDbMatch({ ...base, status: "forfeit", homeScore: 1, awayScore: 0 });
    expect(forfeit.winner_org_id).toBe("org-home");
    // Ties and undecided matches must clear (not preserve) any stale winner.
    expect(toDbMatch({ ...base, status: "completed", homeScore: 1, awayScore: 1 }).winner_org_id).toBeNull();
    const reverted = toDbMatch({ ...base, status: "scheduled" });
    expect(reverted.winner_org_id).toBeNull();
    expect(reverted.score).toBeNull();
  });
});

describe("league-data mock fallback gating (#153)", () => {
  it("returns MOCK_LEAGUE_DATA outside production (dev/test behavior unchanged)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_TEST_MODE", "");
    const { getAdminLeagueData } = await import("./league-data");
    const { MOCK_LEAGUE_DATA } = await import("@/data/mock-league");

    const data = await getAdminLeagueData();
    expect(data).toBe(MOCK_LEAGUE_DATA);
  });

  it("does NOT return MOCK_LEAGUE_DATA in production when Supabase is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_MODE", "");
    const { getAdminLeagueData, LeagueDataUnavailableError } = await import("./league-data");
    const { MOCK_LEAGUE_DATA } = await import("@/data/mock-league");

    await expect(getAdminLeagueData()).rejects.toBeInstanceOf(LeagueDataUnavailableError);
    // Belt-and-suspenders: even if some future refactor swallows the throw,
    // the resolved value must never equal the mock fixture in production.
    await getAdminLeagueData().catch((err) => {
      expect(err).not.toBe(MOCK_LEAGUE_DATA);
    });
  });

  it("still returns MOCK_LEAGUE_DATA in production when E2E_TEST_MODE=1 (Playwright suite)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_MODE", "1");
    const { getAdminLeagueData } = await import("./league-data");
    const { MOCK_LEAGUE_DATA } = await import("@/data/mock-league");

    const data = await getAdminLeagueData();
    expect(data).toBe(MOCK_LEAGUE_DATA);
  });
});
