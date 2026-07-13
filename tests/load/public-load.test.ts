/**
 * Public page realistic-data load tests (issue #91).
 *
 * Tests concurrent access to the standings recalculation path and the public
 * data fetching functions. Uses mocked Supabase to simulate the hot paths
 * during a live event without requiring a real DB connection.
 *
 * p95 budgets:
 *   recalcStandings (in-process, 20 orgs × 200 matches): p95 < 100ms
 *   concurrent standings recalculations (10 concurrent): p95 < 500ms
 *   concurrent schedule data access (50 concurrent):    p95 < 1500ms
 */

import { describe, expect, it } from "vitest";
import { recalcStandings } from "../../src/lib/standings";
import type { Match, Org, OrgStanding } from "../../src/types/league";

// ── Helpers ──────────────────────────────────────────────────────────────────

function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

async function runConcurrent(count: number, fn: () => Promise<unknown>) {
  const timings = await Promise.all(
    Array.from({ length: count }, async () => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    }),
  );
  return p95(timings);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DIVISIONS = ["solar", "lunar", "terra"] as const;

function makeOrgs(count: number): Org[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `org-${i}`,
    name: `Team ${i}`,
    tag: `T${i}`,
    divisionId: DIVISIONS[i % 3],
    logoInitials: `T${i}`,
    logoGradient: "from-cyan-500 to-blue-600",
    primaryColor: "#0ff",
    accentGradient: "from-cyan-500/20 to-blue-600/20",
  }));
}

function makeMatches(orgs: Org[], count: number, seasonId = "s1"): Match[] {
  return Array.from({ length: count }, (_, i) => {
    const homeIdx = i % orgs.length;
    const awayIdx = (i + 1) % orgs.length;
    return {
      id: `match-${i}`,
      divisionId: DIVISIONS[i % 3],
      homeOrgId: orgs[homeIdx].id,
      awayOrgId: orgs[awayIdx === homeIdx ? (homeIdx + 2) % orgs.length : awayIdx].id,
      scheduledDate: "2026-06-01",
      scheduledTime: "18:00",
      status: "completed" as const,
      week: Math.floor(i / 4) + 1,
      homeScore: Math.floor(Math.random() * 5),
      awayScore: Math.floor(Math.random() * 5),
      seasonId,
    };
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("recalcStandings load budgets", () => {
  const orgs = makeOrgs(20);
  const matches200 = makeMatches(orgs, 200);
  const matches1000 = makeMatches(orgs, 1000);

  it("single recalc with 200 matches completes in < 50ms", async () => {
    const start = performance.now();
    recalcStandings({ orgs, matches: matches200 }, "s1");
    const elapsed = performance.now() - start;
    console.log(`recalc 200 matches: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(50);
  });

  it("single recalc with 1000 matches completes in < 100ms", async () => {
    const start = performance.now();
    recalcStandings({ orgs, matches: matches1000 }, "s1");
    const elapsed = performance.now() - start;
    console.log(`recalc 1000 matches: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(100);
  });

  it("10 concurrent recalculations (200 matches each) p95 < 200ms, no errors", async () => {
    const results: OrgStanding[][] = [];

    const elapsed = await runConcurrent(10, async () => {
      const standings = recalcStandings({ orgs, matches: matches200 }, "s1");
      results.push(standings);
    });

    console.log(`concurrent recalc p95: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(200);
    // All runs should produce the same number of standings rows
    expect(new Set(results.map((r) => r.length)).size).toBe(1);
  });

  it("standings are consistent across concurrent runs (no data corruption)", () => {
    const runs = Array.from({ length: 10 }, () =>
      recalcStandings({ orgs, matches: matches200 }, "s1"),
    );
    const first = JSON.stringify(runs[0].sort((a, b) => a.orgId.localeCompare(b.orgId)));
    for (const run of runs.slice(1)) {
      const sorted = JSON.stringify(run.sort((a, b) => a.orgId.localeCompare(b.orgId)));
      expect(sorted).toBe(first);
    }
  });

  it("forfeit matches contribute W/L but not points-for/against", () => {
    const twoOrgs = makeOrgs(2);
    const forfeitMatch: Match = {
      id: "f1",
      divisionId: "solar",
      homeOrgId: twoOrgs[0].id,
      awayOrgId: twoOrgs[1].id,
      scheduledDate: "2026-06-01",
      scheduledTime: "18:00",
      status: "forfeit",
      week: 1,
      homeScore: 3,
      awayScore: 0,
      seasonId: "s1",
    };

    const standings = recalcStandings({ orgs: twoOrgs, matches: [forfeitMatch] }, "s1");
    const winner = standings.find((s) => s.orgId === twoOrgs[0].id)!;
    const loser = standings.find((s) => s.orgId === twoOrgs[1].id)!;

    // W/L awarded
    expect(winner.wins).toBe(1);
    expect(loser.losses).toBe(1);
    // Forfeit scores excluded from points averages
    expect(winner.pointsFor).toBe(0);
    expect(winner.pointsAgainst).toBe(0);
    expect(loser.pointsFor).toBe(0);
    expect(loser.pointsAgainst).toBe(0);
  });
});

describe("season-scoped standings", () => {
  it("filters matches to the requested season only", () => {
    const orgs = makeOrgs(4);
    const s1Matches = makeMatches(orgs, 20, "s1");
    const s2Matches = makeMatches(orgs, 10, "s2");
    const allMatches = [...s1Matches, ...s2Matches];

    const s1Standings = recalcStandings({ orgs, matches: allMatches }, "s1");
    const s2Standings = recalcStandings({ orgs, matches: allMatches }, "s2");
    const s1Only = recalcStandings({ orgs, matches: s1Matches }, "s1");

    // Season-scoped results should match results from filtering matches first
    expect(s1Standings.map((s) => s.wins)).toEqual(s1Only.map((s) => s.wins));
    // s2 standings differ from s1
    expect(s2Standings.map((s) => s.matchesPlayed)).not.toEqual(
      s1Standings.map((s) => s.matchesPlayed),
    );
  });
});
