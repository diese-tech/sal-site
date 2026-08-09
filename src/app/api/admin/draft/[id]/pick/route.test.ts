import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  isAdminRequest: vi.fn(),
  getAdminRequestSession: vi.fn(),
}));
vi.mock("@/lib/draft-data", () => ({
  buildDraftState: vi.fn(),
  getSeasonDraftedPlayerIds: vi.fn(),
  removePlayerFromAllShortlists: vi.fn(),
  submitPickAtomic: vi.fn(),
}));
vi.mock("@/lib/league-data", () => ({
  getLeagueData: vi.fn(),
  writeAuditLog: vi.fn(),
  LeagueDataUnavailableError: class LeagueDataUnavailableError extends Error {},
}));
vi.mock("@/lib/error-monitor", () => ({ reportError: vi.fn() }));

import { isAdminRequest, getAdminRequestSession } from "@/lib/admin-auth";
import { buildDraftState, getSeasonDraftedPlayerIds, submitPickAtomic } from "@/lib/draft-data";
import { getLeagueData, writeAuditLog } from "@/lib/league-data";
import { POST } from "./route";

// Active room at the final slot: pick 4 of 4, org-a on the clock.
const state = {
  room: {
    status: "active" as const,
    id: "room-1",
    seasonId: "season-1",
    baseOrder: ["org-a", "org-b"],
    rounds: 2,
    currentPickIndex: 3,
    divisionId: "solar" as const,
    pickTimerSeconds: 300,
    createdAt: "2026-08-08T00:00:00Z",
  },
  picks: [],
  pickSequence: ["org-a", "org-b", "org-b", "org-a"],
  currentOrgId: "org-a",
  totalPicks: 4,
  secondsRemaining: null,
} as unknown as Awaited<ReturnType<typeof buildDraftState>>;

const ctx = { params: Promise.resolve({ id: "room-1" }) };
const req = (playerId = "player-9", expectedPickIndex = 3) =>
  new NextRequest("http://localhost/api/admin/draft/room-1/pick", {
    method: "POST",
    body: JSON.stringify({ playerId, expectedPickIndex }),
  });

function mockLeaguePlayers(players: Array<{ id: string; divisionId?: string }>) {
  vi.mocked(getLeagueData).mockResolvedValue({ players } as unknown as Awaited<ReturnType<typeof getLeagueData>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAdminRequest).mockReturnValue(true);
  vi.mocked(getAdminRequestSession).mockReturnValue({
    discordId: "admin-123",
    role: "admin",
    exp: Date.now() + 3600000,
  });
  vi.mocked(buildDraftState).mockResolvedValue(state);
  mockLeaguePlayers([{ id: "player-9", divisionId: "solar" }]);
  vi.mocked(getSeasonDraftedPlayerIds).mockResolvedValue(new Set());
  vi.mocked(submitPickAtomic).mockResolvedValue({ ok: true, isComplete: true });
});

describe("admin pick route auth", () => {
  it("rejects non-admin requests with 401", async () => {
    vi.mocked(isAdminRequest).mockReturnValue(false);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });
});

describe("expectedPickIndex validation", () => {
  it("returns 409 when expectedPickIndex does not match room.currentPickIndex", async () => {
    const res = await POST(req("player-9", 2), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "The pick slot has changed. Refresh and try again.",
    });
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });

  it("accepts a matching expectedPickIndex", async () => {
    const res = await POST(req("player-9", 3), ctx);

    expect(res.status).toBe(200);
    expect(submitPickAtomic).toHaveBeenCalled();
  });
});

describe("draft status validation", () => {
  it("rejects picks when draft is paused", async () => {
    const pausedState = {
      ...state,
      room: { ...state!.room, status: "paused" },
    } as Awaited<ReturnType<typeof buildDraftState>>;
    vi.mocked(buildDraftState).mockResolvedValue(pausedState);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Draft is paused, picks are not allowed.",
    });
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });
});

describe("division-locked drafting", () => {
  it("rejects a player whose division differs from the room's", async () => {
    mockLeaguePlayers([{ id: "player-9", divisionId: "terra" }]);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Only solar division players can be drafted in this room.",
    });
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });

  it("rejects a player with no division", async () => {
    mockLeaguePlayers([{ id: "player-9" }]);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(400);
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });
});

describe("season-wide drafted exclusion", () => {
  it("rejects a player already drafted in another room of the season", async () => {
    mockLeaguePlayers([{ id: "player-9", divisionId: "solar" }]);
    vi.mocked(getSeasonDraftedPlayerIds).mockResolvedValue(new Set(["player-9"]));

    const res = await POST(req(), ctx);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Player has already been drafted this season." });
    expect(getSeasonDraftedPlayerIds).toHaveBeenCalledWith("season-1");
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });
});

describe("submitPickAtomic conflict handling", () => {
  it("returns 409 when submitPickAtomic detects a conflict", async () => {
    vi.mocked(submitPickAtomic).mockResolvedValue({ ok: false, conflict: true, message: "Conflict" });

    const res = await POST(req(), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Another pick was recorded first. Refresh and try again.",
    });
  });
});

describe("happy path: admin emergency pick", () => {
  it("derives org from sequence (not request body), submits pick, and logs with admin metadata", async () => {
    const res = await POST(req("player-9", 3), ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      pickNumber: 4,
      complete: true,
    });

    // Verify submitPickAtomic was called with org-a (from sequence[3], not from request)
    expect(submitPickAtomic).toHaveBeenCalledWith("room-1", "org-a", "player-9", 3, 4);

    // Verify audit log includes adminDiscordId and reason fields
    const auditCall = vi.mocked(writeAuditLog).mock.calls[0];
    expect(auditCall[0]).toBe("draft_admin_pick");
    expect(auditCall[3]).toMatchObject({
      adminDiscordId: "admin-123",
      reason: "admin_emergency_pick",
      orgId: "org-a",
      playerId: "player-9",
    });
  });

  it("does not accept orgId in request body", async () => {
    const customReq = new NextRequest("http://localhost/api/admin/draft/room-1/pick", {
      method: "POST",
      body: JSON.stringify({ playerId: "player-9", expectedPickIndex: 3, orgId: "org-b" }),
    });

    const res = await POST(customReq, ctx);

    expect(res.status).toBe(200);
    // Verify it used org-a (from sequence), not org-b (from body)
    expect(submitPickAtomic).toHaveBeenCalledWith("room-1", "org-a", "player-9", 3, 4);
  });
});
