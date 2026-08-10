import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ getAdminRequestSession: vi.fn() }));
vi.mock("@/lib/league-data", () => ({
  advanceWeek: vi.fn(),
  getAllSeasons: vi.fn(),
  saveSeason: vi.fn(),
  setCurrentSeason: vi.fn(),
}));

import { getAdminRequestSession } from "@/lib/admin-auth";
import { advanceWeek, getAllSeasons, saveSeason, setCurrentSeason } from "@/lib/league-data";
import { PATCH } from "./route";

const context = { params: Promise.resolve({ id: "s2" }) };
const season = {
  id: "s2",
  name: "Season 2",
  status: "active" as const,
  isCurrent: true,
  startDate: "2026-08-01",
  endDate: "2026-12-01",
  currentWeek: 2,
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/seasons/s2", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function session(role: "admin" | "super_admin") {
  return { discordId: "admin-1", role, exp: Date.now() + 60_000 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdminRequestSession).mockReturnValue(session("admin"));
  vi.mocked(getAllSeasons).mockResolvedValue([season]);
});

describe("season operation authorization", () => {
  it("rejects an unauthenticated request", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(null);

    const response = await PATCH(request({ action: "advanceWeek" }), context);

    expect(response.status).toBe(401);
    expect(advanceWeek).not.toHaveBeenCalled();
  });

  it("allows a regular admin to advance the week", async () => {
    const response = await PATCH(request({ action: "advanceWeek" }), context);

    expect(response.status).toBe(200);
    expect(advanceWeek).toHaveBeenCalledWith("s2");
  });

  it.each([
    ["set the current season", { action: "setCurrent" }],
    ["update season metadata", { name: "Renamed Season" }],
    ["change season status", { status: "post-season" }],
    ["mix an operational action with a structural change", { action: "advanceWeek", status: "post-season" }],
  ])("prevents a regular admin from trying to %s", async (_label, body) => {
    const response = await PATCH(request(body), context);

    expect(response.status).toBe(403);
    expect(advanceWeek).not.toHaveBeenCalled();
    expect(setCurrentSeason).not.toHaveBeenCalled();
    expect(saveSeason).not.toHaveBeenCalled();
  });

  it("allows a superadmin to set the current season", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(session("super_admin"));

    const response = await PATCH(request({ action: "setCurrent" }), context);

    expect(response.status).toBe(200);
    expect(setCurrentSeason).toHaveBeenCalledWith("s2");
  });

  it("allows a superadmin to update season metadata", async () => {
    vi.mocked(getAdminRequestSession).mockReturnValue(session("super_admin"));

    const response = await PATCH(request({ name: "Season Two" }), context);

    expect(response.status).toBe(200);
    expect(saveSeason).toHaveBeenCalledWith({ ...season, name: "Season Two" });
  });
});
