import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/draft-data", () => ({
  buildDraftState: vi.fn(),
  finalizeDraftRosters: vi.fn(),
  getDraftPicks: vi.fn(),
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

import { buildDraftState, finalizeDraftRosters, getDraftPicks, submitPickAtomic } from "@/lib/draft-data";
import { getCaptainSessionFromRequest } from "@/lib/captain-auth";
import { getLeagueData, writeAuditLog } from "@/lib/league-data";
import { POST } from "./route";

// Active room at the final slot: pick 4 of 4, org-a on the clock.
const state = {
  room: {
    status: "active",
    baseOrder: ["org-a", "org-b"],
    rounds: 2,
    currentPickIndex: 3,
    divisionId: "solar",
  },
} as Awaited<ReturnType<typeof buildDraftState>>;

const ctx = { params: Promise.resolve({ id: "room-1" }) };
const req = () =>
  new NextRequest("http://localhost/api/draft/room-1/pick", {
    method: "POST",
    body: JSON.stringify({ playerId: "player-9" }),
  });

describe("final pick completion does not auto-publish rosters (#210)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCaptainSessionFromRequest).mockReturnValue({ draftRoomId: "room-1", orgId: "org-a" });
    vi.mocked(buildDraftState).mockResolvedValue(state);
    vi.mocked(getLeagueData).mockResolvedValue({ players: [] } as unknown as Awaited<ReturnType<typeof getLeagueData>>);
    vi.mocked(getDraftPicks).mockResolvedValue([]);
    vi.mocked(submitPickAtomic).mockResolvedValue({ ok: true, isComplete: true });
  });

  it("returns complete: true without calling finalizeDraftRosters", async () => {
    const res = await POST(req(), ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, pickNumber: 4, complete: true });
    expect(finalizeDraftRosters).not.toHaveBeenCalled();

    const actions = vi.mocked(writeAuditLog).mock.calls.map((c) => c[0]);
    expect(actions).toEqual(["draft_pick"]);
  });
});
