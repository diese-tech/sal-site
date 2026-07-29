import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/draft-data", () => ({
  buildDraftState: vi.fn(),
  finalizeDraftRosters: vi.fn(),
  getSeasonDraftedPlayerIds: vi.fn(),
  removePlayerFromAllShortlists: vi.fn(),
  submitPickAtomic: vi.fn(),
}));
vi.mock("@/lib/captain-auth", () => ({ getCaptainSessionFromRequest: vi.fn() }));
vi.mock("@/lib/league-data", () => ({
  getLeagueData: vi.fn(),
  writeAuditLog: vi.fn(),
  LeagueDataUnavailableError: class LeagueDataUnavailableError extends Error {},
}));
vi.mock("@/lib/error-monitor", () => ({ reportError: vi.fn() }));

import { buildDraftState, finalizeDraftRosters, getSeasonDraftedPlayerIds, submitPickAtomic } from "@/lib/draft-data";
import { getCaptainSessionFromRequest } from "@/lib/captain-auth";
import { getLeagueData, writeAuditLog } from "@/lib/league-data";
import { POST } from "./route";

// Active room at the final slot: pick 4 of 4, org-a on the clock.
const state = {
  room: {
    status: "active",
    seasonId: "season-1",
    baseOrder: ["org-a", "org-b"],
    rounds: 2,
    currentPickIndex: 3,
    divisionId: "solar",
  },
} as Awaited<ReturnType<typeof buildDraftState>>;

const ctx = { params: Promise.resolve({ id: "room-1" }) };
const req = (playerId = "player-9") =>
  new NextRequest("http://localhost/api/draft/room-1/pick", {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });

function mockLeaguePlayers(players: Array<{ id: string; divisionId?: string }>) {
  vi.mocked(getLeagueData).mockResolvedValue({ players } as unknown as Awaited<ReturnType<typeof getLeagueData>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCaptainSessionFromRequest).mockReturnValue({ draftRoomId: "room-1", orgId: "org-a" });
  vi.mocked(buildDraftState).mockResolvedValue(state);
  mockLeaguePlayers([{ id: "player-9", divisionId: "solar" }]);
  vi.mocked(getSeasonDraftedPlayerIds).mockResolvedValue(new Set());
  vi.mocked(submitPickAtomic).mockResolvedValue({ ok: true, isComplete: true });
});

describe("division-locked drafting (#206)", () => {
  it("rejects a player whose division differs from the room's", async () => {
    mockLeaguePlayers([{ id: "player-9", divisionId: "terra" }]);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Only solar division players can be drafted in this room.",
    });
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });

  it("accepts a player in the room's own division", async () => {
    mockLeaguePlayers([{ id: "player-9", divisionId: "solar" }]);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(200);
    expect(submitPickAtomic).toHaveBeenCalled();
  });

  it("rejects a player with no division", async () => {
    mockLeaguePlayers([{ id: "player-9" }]);

    const res = await POST(req(), ctx);

    expect(res.status).toBe(400);
    expect(submitPickAtomic).not.toHaveBeenCalled();
  });
});

describe("season-wide drafted exclusion (#206)", () => {
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

describe("final pick completion does not auto-publish rosters (#210)", () => {
  it("returns complete: true without calling finalizeDraftRosters", async () => {
    const res = await POST(req(), ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, pickNumber: 4, complete: true });
    expect(finalizeDraftRosters).not.toHaveBeenCalled();

    const actions = vi.mocked(writeAuditLog).mock.calls.map((c) => c[0]);
    expect(actions).toEqual(["draft_pick"]);
  });
});
