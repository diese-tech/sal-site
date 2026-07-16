import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/draft-data", () => ({
  advancePickOnTimeout: vi.fn(),
  buildDraftState: vi.fn(),
  finalizeDraftRosters: vi.fn(),
  getDraftPicks: vi.fn(),
  getShortlist: vi.fn(),
  getTopShortlistPick: vi.fn(),
  removePlayerFromAllShortlists: vi.fn(),
  submitPickAtomic: vi.fn(),
}));
vi.mock("@/lib/captain-auth", () => ({ getCaptainSessionFromRequest: vi.fn(() => null) }));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));

import {
  buildDraftState,
  getDraftPicks,
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
    // Both racers read picks before the winner's insert lands.
    vi.mocked(getDraftPicks).mockResolvedValue([]);
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
