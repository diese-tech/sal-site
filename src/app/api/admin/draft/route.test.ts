import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ isAdminRequest: vi.fn(() => true) }));
vi.mock("@/lib/draft-data", () => ({
  createDraftRoom: vi.fn(),
  getDraftRooms: vi.fn(),
}));
vi.mock("@/lib/league-data", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/error-monitor", () => ({ errorMessage: vi.fn((_err: unknown, fallback: string) => fallback) }));

import { createDraftRoom, getDraftRooms } from "@/lib/draft-data";
import { POST } from "./route";

const req = () =>
  new NextRequest("http://localhost/api/admin/draft", {
    method: "POST",
    body: JSON.stringify({ id: "solar-s2", seasonId: "season-1", divisionId: "solar" }),
  });

const existingRoom = (status: string) =>
  ({ id: "solar-s1", seasonId: "season-1", divisionId: "solar", status }) as Awaited<
    ReturnType<typeof getDraftRooms>
  >[number];

describe("duplicate same-division room guard (#206)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDraftRoom).mockImplementation(async (input) => ({ id: input.id }) as Awaited<ReturnType<typeof createDraftRoom>>);
  });

  it("rejects creation while a same-division room is paused", async () => {
    vi.mocked(getDraftRooms).mockResolvedValue([existingRoom("paused")]);

    const res = await POST(req());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'A draft room for division "solar" is already paused. Complete or cancel it before creating another.',
    });
    expect(createDraftRoom).not.toHaveBeenCalled();
  });

  it("allows creation when the same-division room is complete", async () => {
    vi.mocked(getDraftRooms).mockResolvedValue([existingRoom("complete")]);

    const res = await POST(req());

    expect(res.status).toBe(201);
    expect(createDraftRoom).toHaveBeenCalledWith({ id: "solar-s2", seasonId: "season-1", divisionId: "solar" });
  });
});
