import { describe, expect, it } from "vitest";
import { isMatchLive } from "@/lib/match-live";
import type { Match } from "@/types/league";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "m-1",
    divisionId: "solar",
    homeOrgId: "org-a",
    awayOrgId: "org-b",
    scheduledDate: "2026-06-10",
    scheduledTime: "19:00",
    status: "live",
    week: 1,
    seasonId: "s1",
    ...overrides,
  };
}

describe("isMatchLive", () => {
  const start = new Date("2026-06-10T19:00:00");

  it("returns true for a live match at its scheduled start", () => {
    expect(isMatchLive(makeMatch(), start)).toBe(true);
  });

  it("returns true within the live window (2 hours in)", () => {
    const now = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    expect(isMatchLive(makeMatch(), now)).toBe(true);
  });

  it("returns true slightly before scheduled start (early broadcast)", () => {
    const now = new Date(start.getTime() - 15 * 60 * 1000);
    expect(isMatchLive(makeMatch(), now)).toBe(true);
  });

  it("returns false for a stale live row long after its scheduled date", () => {
    const now = new Date("2027-01-01T12:00:00");
    expect(isMatchLive(makeMatch(), now)).toBe(false);
  });

  it("returns false well before the scheduled start", () => {
    const now = new Date(start.getTime() - 3 * 60 * 60 * 1000);
    expect(isMatchLive(makeMatch(), now)).toBe(false);
  });

  it("returns false when status is not live, regardless of time", () => {
    expect(isMatchLive(makeMatch({ status: "scheduled" }), start)).toBe(false);
    expect(isMatchLive(makeMatch({ status: "completed" }), start)).toBe(false);
  });

  it("returns false for an unparseable scheduled date", () => {
    expect(isMatchLive(makeMatch({ scheduledDate: "not-a-date" }), start)).toBe(false);
  });
});
