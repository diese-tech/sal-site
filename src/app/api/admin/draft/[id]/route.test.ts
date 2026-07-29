import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: vi.fn(() => true) }));
vi.mock("@/lib/draft-data", () => ({
  getDraftRoom: vi.fn(),
  updateDraftRoomGuarded: vi.fn(),
}));

import { getDraftRoom, updateDraftRoomGuarded } from "@/lib/draft-data";
import { PATCH } from "./route";

const room = {
  id: "room-1",
  status: "pending",
  baseOrder: ["org-a", "org-b"],
  rounds: 2,
  pickTimerSeconds: 120,
  currentPickIndex: 0,
} as Awaited<ReturnType<typeof getDraftRoom>>;

const ctx = { params: Promise.resolve({ id: "room-1" }) };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/draft/room-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/draft/[id] config immutability (#208)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects config changes once the draft is active and never touches the room", async () => {
    vi.mocked(getDraftRoom).mockResolvedValue({ ...room!, status: "active" });

    const response = await PATCH(request({ rounds: 3 }), ctx);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Cannot modify a draft with status "active".' });
    expect(updateDraftRoomGuarded).not.toHaveBeenCalled();
  });

  it("applies the patch while the draft is still pending", async () => {
    vi.mocked(getDraftRoom).mockResolvedValue(room);
    vi.mocked(updateDraftRoomGuarded).mockResolvedValue({ ...room!, rounds: 3 });

    const response = await PATCH(request({ rounds: 3 }), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ room: { ...room!, rounds: 3 } });
    expect(updateDraftRoomGuarded).toHaveBeenCalledTimes(1);
    expect(updateDraftRoomGuarded).toHaveBeenCalledWith("room-1", { status: "pending" }, { rounds: 3 });
  });

  it("returns 409 when a concurrent start wins between the read and the guarded update", async () => {
    vi.mocked(getDraftRoom).mockResolvedValue(room);
    vi.mocked(updateDraftRoomGuarded).mockResolvedValue(null);

    const response = await PATCH(request({ rounds: 3 }), ctx);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Draft is no longer pending. Refresh and retry." });
  });

  it("returns 404 for an unknown room", async () => {
    vi.mocked(getDraftRoom).mockResolvedValue(null);

    const response = await PATCH(request({ rounds: 3 }), ctx);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Draft room not found." });
    expect(updateDraftRoomGuarded).not.toHaveBeenCalled();
  });
});
