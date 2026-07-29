import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: vi.fn(() => true) }));
vi.mock("@/lib/draft-data", () => ({
  buildDraftState: vi.fn(),
  updateDraftRoomIfPickIndex: vi.fn(),
}));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));

import { buildDraftState, updateDraftRoomIfPickIndex } from "@/lib/draft-data";
import { writeAuditLog } from "@/lib/league-data";
import { POST } from "./route";

// 2 orgs × 2 rounds → 4-pick snake sequence.
const room = {
  id: "room-1",
  status: "active",
  baseOrder: ["org-a", "org-b"],
  rounds: 2,
  pickTimerSeconds: 120,
  currentPickIndex: 1,
};

function stateFor(overrides: Partial<typeof room>) {
  return { room: { ...room, ...overrides } } as Awaited<ReturnType<typeof buildDraftState>>;
}

const ctx = { params: Promise.resolve({ id: "room-1" }) };
const req = () => new NextRequest("http://localhost/api/admin/draft/room-1/skip", { method: "POST" });

describe("POST /api/admin/draft/[id]/skip concurrency guard (#207)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 and writes no audit log when a concurrent action advanced the draft", async () => {
    vi.mocked(buildDraftState).mockResolvedValue(stateFor({}));
    vi.mocked(updateDraftRoomIfPickIndex).mockResolvedValue(null);

    const response = await POST(req(), ctx);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Another action advanced the draft. Refresh and retry." });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("advances an active mid-draft pick under the index guard and audits once", async () => {
    vi.mocked(buildDraftState).mockResolvedValue(stateFor({}));
    const updated = { ...room, currentPickIndex: 2 };
    vi.mocked(updateDraftRoomIfPickIndex).mockResolvedValue(updated as Awaited<ReturnType<typeof updateDraftRoomIfPickIndex>>);

    const response = await POST(req(), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room: updated, skipped: true, complete: false });
    expect(updateDraftRoomIfPickIndex).toHaveBeenCalledTimes(1);
    expect(updateDraftRoomIfPickIndex).toHaveBeenCalledWith("room-1", 1, {
      currentPickIndex: 2,
      status: "active",
      pickStartedAt: expect.any(String),
      completedAt: null,
    });
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith("draft_pick_skipped", "draft_room", "room-1", { skippedPickIndex: 1 });
  });

  it("keeps a paused draft paused when skipping", async () => {
    vi.mocked(buildDraftState).mockResolvedValue(stateFor({ status: "paused" }));
    const updated = { ...room, status: "paused", currentPickIndex: 2 };
    vi.mocked(updateDraftRoomIfPickIndex).mockResolvedValue(updated as Awaited<ReturnType<typeof updateDraftRoomIfPickIndex>>);

    const response = await POST(req(), ctx);

    expect(response.status).toBe(200);
    expect(updateDraftRoomIfPickIndex).toHaveBeenCalledWith("room-1", 1, expect.objectContaining({ status: "paused" }));
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("completes the draft when the final slot is skipped", async () => {
    vi.mocked(buildDraftState).mockResolvedValue(stateFor({ currentPickIndex: 3 }));
    const updated = { ...room, status: "complete", currentPickIndex: 4 };
    vi.mocked(updateDraftRoomIfPickIndex).mockResolvedValue(updated as Awaited<ReturnType<typeof updateDraftRoomIfPickIndex>>);

    const response = await POST(req(), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room: updated, skipped: true, complete: true });
    expect(updateDraftRoomIfPickIndex).toHaveBeenCalledWith("room-1", 3, {
      currentPickIndex: 4,
      status: "complete",
      pickStartedAt: null,
      completedAt: expect.any(String),
    });
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith("draft_pick_skipped", "draft_room", "room-1", { skippedPickIndex: 3 });
  });
});
