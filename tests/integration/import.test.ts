/**
 * Import endpoint integration tests (issue #91, extended for #230).
 *
 * Tests the server-side deduplication, validation, and partial-import behavior
 * of POST /api/admin/import/players. Uses vi.mock to avoid a real Supabase
 * connection; actual DB integration is covered by the E2E suite.
 *
 * Behavior under test:
 *   • Duplicate IGNs within one upload are rejected before any DB write.
 *   • Rows with invalid schema fields are caught at parse time (400).
 *   • Valid batches are accepted; partial success is allowed (partial imports
 *     are non-transactional by design — see issue #74 decision comment).
 *   • Every saved player is enrolled into the selected season/division via
 *     season_rosters, and a season enrollment failure is reported as an
 *     error rather than counted as a successful import (#230).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  isAdminRequest: () => true,
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/error-monitor", () => ({
  errorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
  reportError: vi.fn(),
}));

vi.mock("@/lib/league-data", () => ({
  savePlayersBulk: vi.fn().mockResolvedValue(undefined),
  savePlayer: vi.fn().mockResolvedValue(undefined),
  saveSeasonOrgAssignment: vi.fn().mockResolvedValue(undefined),
  saveSeasonRosterAssignment: vi.fn().mockResolvedValue(undefined),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Chainable stub covering both the season-existence check (select().eq().maybeSingle())
// and the org lookup (select()) the route runs against the same client. Tests
// that need a resolvable org override `orgRows` via the module-level var below.
let orgRows: Array<{
  id: string;
  name: string;
  tag: string;
  division_id: string;
  archived_at: string | null;
}> = [];
let existingPlayerRows: Array<{ id: string; archived_at: string | null }> = [];
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => {
        if (table === "seasons") {
          return {
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "preseason-2" }, error: null }),
            }),
          };
        }
        if (table === "orgs") {
          return {
            is: (_column: string, value: null) =>
              Promise.resolve({
                data: orgRows.filter((org) => org.archived_at === value),
                error: null,
              }),
          };
        }
        if (table === "players") {
          return {
            in: (_column: string, ids: string[]) =>
              Promise.resolve({
                data: existingPlayerRows.filter((player) => ids.includes(player.id)),
                error: null,
              }),
          };
        }
        return Promise.resolve({ data: [], error: null });
      },
    }),
  })),
}));

beforeEach(() => {
  orgRows = [];
  existingPlayerRows = [];
});

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/import/players", {
    method: "POST",
    body: JSON.stringify({ seasonId: "preseason-2", divisionId: "terra", ...body }),
    headers: { "Content-Type": "application/json" },
  });
}

function validPlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: `player-${Math.random()}`,
    ign: `TestPlayer${Math.floor(Math.random() * 9999)}`,
    avatarInitials: "TP",
    avatarGradient: "from-cyan-500",
    ...overrides,
  };
}

describe("POST /api/admin/import/players — duplicate IGN rejection", () => {
  it("rejects a batch with two identical IGNs before any DB write", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { savePlayersBulk } = await import("@/lib/league-data");

    const player = validPlayer({ ign: "DupePlayer" });
    const req = makeRequest({ players: [player, { ...player, id: "different-id" }] });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].ign).toBe("DupePlayer");
    expect(savePlayersBulk).not.toHaveBeenCalled();
  });

  it("rejects case-insensitive duplicates (TESTPLAYER vs testplayer)", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");

    const req = makeRequest({
      players: [
        validPlayer({ ign: "TESTPLAYER" }),
        validPlayer({ ign: "testplayer" }),
      ],
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors[0].error).toMatch(/duplicate/i);
  });

  it("accepts a batch where all IGNs are unique", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");

    const req = makeRequest({
      players: [
        validPlayer({ ign: "Alpha" }),
        validPlayer({ ign: "Beta" }),
        validPlayer({ ign: "Gamma" }),
      ],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(3);
    expect(data.errors).toHaveLength(0);
  });
});

describe("POST /api/admin/import/players — schema validation", () => {
  it("returns 400 when IGN is missing", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");

    const req = makeRequest({
      players: [{ id: "p1", avatarInitials: "XX", avatarGradient: "from-red-500" }],
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty player array", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");

    const req = makeRequest({ players: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a batch exceeding 500 rows", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");

    const req = makeRequest({
      players: Array.from({ length: 501 }, (_, i) =>
        validPlayer({ ign: `Player${i}` })
      ),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/import/players — partial import behavior", () => {
  it("falls back to per-row saves when bulk upsert fails", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { savePlayersBulk, savePlayer } = await import("@/lib/league-data");

    vi.mocked(savePlayersBulk).mockRejectedValueOnce(new Error("bulk constraint violation"));
    vi.mocked(savePlayer)
      .mockResolvedValueOnce(undefined) // row 1 succeeds
      .mockRejectedValueOnce(new Error("ign conflict")) // row 2 fails
      .mockResolvedValueOnce(undefined); // row 3 succeeds

    const req = makeRequest({
      players: [
        validPlayer({ ign: "Alpha" }),
        validPlayer({ ign: "Beta" }),
        validPlayer({ ign: "Gamma" }),
      ],
    });
    const res = await POST(req);
    const data = await res.json();

    // Partial-commit: 2 saved, 1 errored
    expect(data.imported).toBe(2);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].ign).toBe("Beta");
  });
});

describe("POST /api/admin/import/players — season enrollment (#230)", () => {
  it("returns 400 when the seasonId or divisionId is missing", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");

    const req = new NextRequest("http://localhost/api/admin/import/players", {
      method: "POST",
      body: JSON.stringify({ players: [validPlayer({ ign: "NoSeason" })] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the selected season does not exist", async () => {
    const { getSupabaseServerClient } = await import("@/lib/supabase-server");
    vi.mocked(getSupabaseServerClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const { POST } = await import("@/app/api/admin/import/players/route");

    const req = makeRequest({ players: [validPlayer({ ign: "GhostSeason" })] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/does not exist/i);
  });

  it("enrolls every saved player into the selected season/division as a free agent", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { saveSeasonRosterAssignment } = await import("@/lib/league-data");
    vi.mocked(saveSeasonRosterAssignment).mockClear();

    const req = makeRequest({
      seasonId: "preseason-2",
      divisionId: "solar",
      players: [validPlayer({ ign: "Enrollee", id: "player-enrollee" })],
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.imported).toBe(1);
    expect(saveSeasonRosterAssignment).toHaveBeenCalledWith({
      seasonId: "preseason-2",
      playerId: "player-enrollee",
      orgId: null,
      divisionId: "solar",
      isCaptain: false,
    });
  });

  it("enrolls a resolved existing org into the selected season before assigning the player to it", async () => {
    orgRows = [{ id: "org-a", name: "Obsidian Knights", tag: "OBS", division_id: "terra", archived_at: null }];
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { saveSeasonOrgAssignment, saveSeasonRosterAssignment } = await import("@/lib/league-data");
    vi.mocked(saveSeasonOrgAssignment).mockClear();
    vi.mocked(saveSeasonRosterAssignment).mockClear();

    const req = makeRequest({
      seasonId: "preseason-2",
      divisionId: "solar",
      players: [validPlayer({ ign: "TeamPlayer", id: "player-team", orgId: "org-a" })],
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.imported).toBe(1);
    // The batch's selected division ("solar") wins — an org's own division_id
    // column is only its legacy/default display division, not this import's
    // target, so it must not override which division season_orgs is enrolled
    // into (an org already fielding a team in one division must still be
    // enrollable into a second division via a later import).
    expect(saveSeasonOrgAssignment).toHaveBeenCalledWith("preseason-2", "org-a", "solar");
    expect(saveSeasonRosterAssignment).toHaveBeenCalledWith({
      seasonId: "preseason-2",
      playerId: "player-team",
      orgId: "org-a",
      divisionId: "solar",
      isCaptain: false,
    });
  });

  it("enrolls the same org into a second division when a per-row divisionId requests it", async () => {
    // An org can field an independent team in more than one division. Its legacy
    // division_id column ("terra") must not stand in for a batch importing a
    // *different* division's roster ("lunar") for the same org.
    orgRows = [{ id: "org-a", name: "Obsidian Knights", tag: "OBS", division_id: "terra", archived_at: null }];
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { saveSeasonOrgAssignment, saveSeasonRosterAssignment } = await import("@/lib/league-data");
    vi.mocked(saveSeasonOrgAssignment).mockClear();
    vi.mocked(saveSeasonRosterAssignment).mockClear();

    const req = makeRequest({
      seasonId: "preseason-2",
      divisionId: "solar",
      players: [validPlayer({ ign: "LunarPlayer", id: "player-lunar", orgId: "org-a", divisionId: "lunar" })],
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.imported).toBe(1);
    expect(saveSeasonOrgAssignment).toHaveBeenCalledWith("preseason-2", "org-a", "lunar");
    expect(saveSeasonRosterAssignment).toHaveBeenCalledWith({
      seasonId: "preseason-2",
      playerId: "player-lunar",
      orgId: "org-a",
      divisionId: "lunar",
      isCaptain: false,
    });
  });

  it("does not count a player as imported when season enrollment fails, and reports it as an error", async () => {
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { saveSeasonRosterAssignment } = await import("@/lib/league-data");
    vi.mocked(saveSeasonRosterAssignment).mockReset();
    vi.mocked(saveSeasonRosterAssignment)
      .mockResolvedValueOnce(undefined) // Alpha enrolls fine
      .mockRejectedValueOnce(new Error("season_orgs lookup failed")); // Beta fails enrollment

    const req = makeRequest({
      players: [validPlayer({ ign: "Alpha" }), validPlayer({ ign: "Beta" })],
    });
    const res = await POST(req);
    const data = await res.json();

    expect(data.imported).toBe(1);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].ign).toBe("Beta");
    expect(data.errors[0].error).toMatch(/failed to enroll in season/i);

    vi.mocked(saveSeasonRosterAssignment).mockReset().mockResolvedValue(undefined);
  });
});

describe("POST /api/admin/import/players - archived identity guards", () => {
  it("rejects an archived player id before any identity or roster write", async () => {
    existingPlayerRows = [
      { id: "archived-player", archived_at: "2026-08-03T21:26:58.243Z" },
    ];
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { savePlayersBulk, savePlayer, saveSeasonRosterAssignment } = await import("@/lib/league-data");
    vi.mocked(savePlayersBulk).mockClear();
    vi.mocked(savePlayer).mockClear();
    vi.mocked(saveSeasonRosterAssignment).mockClear();

    const req = makeRequest({
      players: [validPlayer({ id: "archived-player", ign: "ArchivedPlayer" })],
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.imported).toBe(0);
    expect(data.errors).toEqual([
      {
        ign: "ArchivedPlayer",
        error: "Player already exists but is archived. Restore the player before enrolling them.",
      },
    ]);
    expect(savePlayersBulk).not.toHaveBeenCalled();
    expect(savePlayer).not.toHaveBeenCalled();
    expect(saveSeasonRosterAssignment).not.toHaveBeenCalled();
  });

  it("does not resolve or enroll an archived org", async () => {
    orgRows = [{
      id: "archived-org",
      name: "Archived Organization",
      tag: "ARC",
      division_id: "terra",
      archived_at: "2026-08-03T20:00:00.000Z",
    }];
    const { POST } = await import("@/app/api/admin/import/players/route");
    const { saveSeasonOrgAssignment, saveSeasonRosterAssignment } = await import("@/lib/league-data");
    vi.mocked(saveSeasonOrgAssignment).mockClear();
    vi.mocked(saveSeasonRosterAssignment).mockClear();

    const req = makeRequest({
      players: [validPlayer({ id: "player-archived-org", ign: "NoArchivedOrg", orgId: "archived-org" })],
    });
    const res = await POST(req);
    const data = await res.json();

    expect(data.imported).toBe(1);
    expect(data.warnings[0].warning).toMatch(/unknown team/i);
    expect(saveSeasonOrgAssignment).not.toHaveBeenCalled();
    expect(saveSeasonRosterAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: "player-archived-org", orgId: null }),
    );
  });
});
