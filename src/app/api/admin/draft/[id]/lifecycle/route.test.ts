import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/error-monitor", () => ({
  errorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
  reportError: vi.fn(),
}));

import { createDraftRoomLifecycleHandler } from "./route";

const deletePending = vi.fn();
const voidRoom = vi.fn();
const revalidateDraft = vi.fn();
const context = { params: Promise.resolve({ id: "room-1" }) };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/draft/room-1/lifecycle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/draft/[id]/lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a regular admin to delete an unused pending room after explicit confirmation", async () => {
    deletePending.mockResolvedValue({ code: "deleted", applied: true, draftRoomId: "room-1" });
    const handler = createDraftRoomLifecycleHandler({
      getSession: () => ({ discordId: "admin-1", role: "admin" }),
      deletePending,
      voidRoom,
      revalidateDraft,
    });

    const response = await handler(request({ action: "delete", confirmation: "DELETE" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, code: "deleted" });
    expect(deletePending).toHaveBeenCalledWith("room-1", "admin-1");
    expect(revalidateDraft).toHaveBeenCalledWith("room-1");
  });

  it("allows a regular admin to void an opened room with an audited reason", async () => {
    voidRoom.mockResolvedValue({ code: "voided", applied: true, draftRoomId: "room-1" });
    const handler = createDraftRoomLifecycleHandler({
      getSession: () => ({ discordId: "admin-1", role: "admin" }),
      deletePending,
      voidRoom,
      revalidateDraft,
    });

    const response = await handler(request({
      action: "void",
      confirmation: "VOID",
      reason: "Wrong captain order",
    }), context);

    expect(response.status).toBe(200);
    expect(voidRoom).toHaveBeenCalledWith("room-1", "admin-1", "Wrong captain order");
  });

  it("rejects a missing session and never calls the database", async () => {
    const handler = createDraftRoomLifecycleHandler({
      getSession: () => null,
      deletePending,
      voidRoom,
      revalidateDraft,
    });

    const response = await handler(request({ action: "delete", confirmation: "DELETE" }), context);

    expect(response.status).toBe(401);
    expect(deletePending).not.toHaveBeenCalled();
  });

  it("requires the exact confirmation token", async () => {
    const handler = createDraftRoomLifecycleHandler({
      getSession: () => ({ discordId: "admin-1", role: "admin" }),
      deletePending,
      voidRoom,
      revalidateDraft,
    });

    const response = await handler(request({ action: "delete", confirmation: "yes" }), context);

    expect(response.status).toBe(400);
    expect(deletePending).not.toHaveBeenCalled();
  });

  it("maps database lifecycle conflicts to 409", async () => {
    deletePending.mockRejectedValue(Object.assign(
      new Error("Pending draft room has draft picks and must be preserved."),
      { code: "23514" },
    ));
    const handler = createDraftRoomLifecycleHandler({
      getSession: () => ({ discordId: "admin-1", role: "admin" }),
      deletePending,
      voidRoom,
      revalidateDraft,
    });

    const response = await handler(request({ action: "delete", confirmation: "DELETE" }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Pending draft room has draft picks and must be preserved.",
    });
    expect(revalidateDraft).not.toHaveBeenCalled();
  });
});
