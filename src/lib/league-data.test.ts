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
