import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/draft-data", () => ({
  advancePickOnTimeout: vi.fn(),
  buildDraftState: vi.fn(),
  finalizeDraftRosters: vi.fn(),
  getSeasonDraftedPlayerIds: vi.fn(),
  getShortlist: vi.fn(),
  getTopShortlistPick: vi.fn(),
  removePlayerFromAllShortlists: vi.fn(),
  submitPickAtomic: vi.fn(),
}));
vi.mock("@/lib/captain-auth", () => ({ getCaptainSessionFromRequest: vi.fn(() => null) }));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));

import {
  advancePickOnTimeout,
  buildDraftState,
  finalizeDraftRosters,
  getSeasonDraftedPlayerIds,
  getTopShortlistPick,
  removePlayerFromAllShortlists,
  submitPickAtomic,
} from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { GET } from "./route";

// Expired-timer active room: org-a on the clock for pick 1 of 4.
const state = {
  room: {
    status: "active",
    seasonId: "season-1",
    pickStartedAt: new Date(Date.now() - 60_000).toISOString(),
    pickTimerSeconds: 10,
    baseOrder: ["org-a", "org-b"],
    rounds: 2,
    currentPickIndex: 0,
  },
} as Awaited<ReturnType<typeof buildDraftState>>;

const ctx = { params: Promise.resolve({ id: "room-1" }) };
const req = () => new NextRequest("http://localhost/api/draft/room-1");

describe("auto-pick conflict logging (#141)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildDraftState).mockResolvedValue(state);
    vi.mocked(getTopShortlistPick).mockResolvedValue("player-1");
    // Both racers read the season drafted set before the winner's insert lands.
    vi.mocked(getSeasonDraftedPlayerIds).mockResolvedValue(new Set());
  });

  it("two concurrent timer-expiry polls log one auto_pick and one auto_pick_conflict", async () => {
    vi.mocked(submitPickAtomic)
      .mockResolvedValueOnce({ ok: true, isComplete: false })
      .mockResolvedValueOnce({ ok: false, conflict: true, message: "PICK_CONFLICT" });

    await Promise.all([GET(req(), ctx), GET(req(), ctx)]);

    const actions = vi.mocked(writeAuditLog).mock.calls.map((c) => c[0]);
    expect(actions.filter((a) => a === "draft_auto_pick")).toHaveLength(1);
    expect(actions.filter((a) => a === "draft_auto_pick_conflict")).toHaveLength(1);

    const conflict = vi.mocked(writeAuditLog).mock.calls.find((c) => c[0] === "draft_auto_pick_conflict");
    expect(conflict).toEqual([
      "draft_auto_pick_conflict",
      "draft_pick",
      "room-1-1",
      {
        draftRoomId: "room-1",
        pickNumber: 1,
        orgId: "org-a",
        attemptedPlayerId: "player-1",
        reason: "concurrent_pick_conflict",
      },
    ]);
    // Only the winner clears shortlists.
    expect(removePlayerFromAllShortlists).toHaveBeenCalledTimes(1);
  });

  it("non-conflict failure logs nothing", async () => {
    vi.mocked(submitPickAtomic).mockResolvedValue({ ok: false, conflict: false, message: "boom" });

    await GET(req(), ctx);

    expect(writeAuditLog).not.toHaveBeenCalled();
    expect(removePlayerFromAllShortlists).not.toHaveBeenCalled();
  });
});

describe("auto-pick uses the season-wide drafted set (#206)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildDraftState).mockResolvedValue(state);
    vi.mocked(getTopShortlistPick).mockResolvedValue("player-1");
  });

  it("passes the room's seasonId to getTopShortlistPick", async () => {
    vi.mocked(getSeasonDraftedPlayerIds).mockResolvedValue(new Set());
    vi.mocked(submitPickAtomic).mockResolvedValue({ ok: true, isComplete: false });

    await GET(req(), ctx);

    expect(getTopShortlistPick).toHaveBeenCalledWith("room-1", "org-a", "season-1");
  });

  it("does not auto-pick a shortlisted player drafted in another room of the season", async () => {
    vi.mocked(getSeasonDraftedPlayerIds).mockResolvedValue(new Set(["player-1"]));
    vi.mocked(advancePickOnTimeout).mockResolvedValue(true);

    await GET(req(), ctx);

    expect(getSeasonDraftedPlayerIds).toHaveBeenCalledWith("season-1");
    expect(submitPickAtomic).not.toHaveBeenCalled();
    // Falls through to the timer skip instead of picking a drafted player.
    expect(advancePickOnTimeout).toHaveBeenCalled();
  });
});

describe("draft completion does not auto-publish rosters (#210)", () => {
  // Same room at the final slot: pick 4 of 4, org-a on the clock.
  const finalSlotState = {
    room: {
      status: "active",
      seasonId: "season-1",
      pickStartedAt: new Date(Date.now() - 60_000).toISOString(),
      pickTimerSeconds: 10,
      baseOrder: ["org-a", "org-b"],
      rounds: 2,
      currentPickIndex: 3,
    },
  } as Awaited<ReturnType<typeof buildDraftState>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildDraftState).mockResolvedValue(finalSlotState);
    vi.mocked(getSeasonDraftedPlayerIds).mockResolvedValue(new Set());
  });

  it("a completing shortlist auto-pick does not call finalizeDraftRosters", async () => {
    vi.mocked(getTopShortlistPick).mockResolvedValue("player-1");
    vi.mocked(submitPickAtomic).mockResolvedValue({ ok: true, isComplete: true });

    await GET(req(), ctx);

    expect(finalizeDraftRosters).not.toHaveBeenCalled();
    const actions = vi.mocked(writeAuditLog).mock.calls.map((c) => c[0]);
    expect(actions).toContain("draft_auto_pick");
    expect(actions).not.toContain("draft_finalized");
  });

  it("a completing auto-skip does not call finalizeDraftRosters", async () => {
    vi.mocked(getTopShortlistPick).mockResolvedValue(null);
    vi.mocked(advancePickOnTimeout).mockResolvedValue(true);

    await GET(req(), ctx);

    expect(finalizeDraftRosters).not.toHaveBeenCalled();
    const actions = vi.mocked(writeAuditLog).mock.calls.map((c) => c[0]);
    expect(actions).toContain("draft_auto_skip");
    expect(actions).not.toContain("draft_finalized");
  });
});
