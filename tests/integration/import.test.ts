/**
 * Import endpoint integration tests (issue #91).
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
 */

import { describe, expect, it, vi } from "vitest";
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
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  }),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/import/players", {
    method: "POST",
    body: JSON.stringify(body),
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
